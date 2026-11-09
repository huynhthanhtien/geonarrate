"""Worker nền: dịch (UC-05), sinh audio (UC-07), build pack (UC-09); kèm trạng thái cho CMS."""

import hashlib
import io
import json
import zipfile
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.exceptions import ConflictError, InvalidContentError, NotFoundError
from app.integrations.quality import LocalQuality
from app.integrations.storage.local import LocalStorage
from app.integrations.translate.base import GlossaryTerm, TranslateProvider
from app.integrations.tts.base import TTSProvider
from app.models.audit import AuditResource
from app.repositories.attraction_repo import AttractionRepository
from app.repositories.audio_repo import SqlAudioRepository
from app.repositories.glossary_repo import SqlGlossaryRepository
from app.repositories.job_repo import SqlJobRepository, job_spec, text_hash
from app.repositories.language_repo import LanguageRepository
from app.repositories.tour_repo import SqlTourRepository
from app.repositories.translation_repo import SqlTranslationRepository
from app.services.audit_service import AuditService
from app.services.content_service import qa_flags

VOICES = {
    "vi": "vi-VN-HoaiMyNeural",
    "en": "en-US-AriaNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
}
SOURCE_LANG = "vi"
MP3_BYTES_PER_SECOND = 6000  # Các provider xuất MP3 48 kbps.
STALE_AFTER = timedelta(minutes=10)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class PipelineService:
    def __init__(
        self,
        jobs: SqlJobRepository,
        attractions: AttractionRepository,
        translations: SqlTranslationRepository,
        glossary: SqlGlossaryRepository,
        audio: SqlAudioRepository,
        tours: SqlTourRepository,
        languages: LanguageRepository,
        audit: AuditService,
        storage: LocalStorage,
        translator: TranslateProvider,
        tts: TTSProvider,
        clock: Callable[[], datetime] = _utcnow,
        *,
        tts_voice: str | None = None,
        quality: LocalQuality | None = None,
        comet_qe_min: float = 0.8,
        asr_wer_max: float = 0.08,
    ) -> None:
        self._jobs = jobs
        self._attractions = attractions
        self._translations = translations
        self._glossary = glossary
        self._audio = audio
        self._tours = tours
        self._languages = languages
        self._audit = audit
        self._storage = storage
        self._translator = translator
        self._tts = tts
        self._tts_voice = tts_voice
        self._quality = quality or LocalQuality()
        self._comet_qe_min = comet_qe_min
        self._asr_wer_max = asr_wer_max
        self._clock = clock

    # --- worker
    async def run_once(self) -> bool:
        """Xử lý một job; trả về False khi hàng đợi trống."""
        now = self._clock()
        await self._jobs.requeue_stale(now - STALE_AFTER, now)
        job = await self._jobs.claim_next(now)
        if job is None:
            return False
        try:
            handler = {
                "translate": self._translate,
                "audio": self._generate_audio,
                "pack_build": self._build_pack,
            }[job["type"]]
            await handler(job["payload"])
        except Exception as e:  # lỗi nhà cung cấp, mạng, đĩa: ghi lại để thử lại hoặc báo CMS
            await self._jobs.fail(job["id"], job["attempts"], str(e) or repr(e), self._clock())
            if job["type"] == "pack_build" and job["attempts"] >= 3:
                await self._audio.update_pack(
                    job["payload"]["pack_id"], {"status": "failed"}, self._clock()
                )
            return True
        await self._jobs.finish(job["id"], self._clock())
        return True

    async def _translate(self, p: dict[str, Any]) -> None:
        attraction = await self._attractions.get(p["attraction_id"])
        if attraction is None:
            return
        rows = await self._glossary.for_translation(p["attraction_id"], p["lang"])
        terms = [GlossaryTerm(r["term"], r["translation"], r["is_required"]) for r in rows]
        text = await self._translator.translate(attraction.script, SOURCE_LANG, p["lang"], terms)
        score = await self._quality.translation_score(attraction.script, text)
        flags = qa_flags(attraction.script, text, rows, self._translator.name)
        if score is not None and score < self._comet_qe_min:
            flags.append("low_comet_qe")
        await self._translations.upsert_machine(
            p["attraction_id"],
            p["lang"],
            text,
            self._translator.name,
            flags,
            text_hash(text),
            self._clock(),
            comet_qe=score,
        )

    async def _approved_text(self, attraction_id: str, lang: str) -> str | None:
        if lang == SOURCE_LANG:
            a = await self._attractions.get(attraction_id)
            approved = a is not None and a.script_status.value == "approved"
            return a.script if approved and a is not None else None
        row = await self._translations.approved_for(attraction_id, lang)
        return row["text"] if row else None

    async def _generate_audio(self, p: dict[str, Any]) -> None:
        aid, lang = p["attraction_id"], p["lang"]
        text = await self._approved_text(aid, lang)
        if text is None:
            return  # nội dung đã đổi sau khi tạo job: lần duyệt sau sẽ tạo job mới
        h = text_hash(text)
        if await self._audio.find_asset(aid, lang, h):
            return
        voice = self._tts_voice or VOICES.get(lang, VOICES["en"])
        data = await self._tts.synthesize(text, voice, lang=lang)
        if not data:
            raise RuntimeError("TTS không trả về âm thanh")
        wer = await self._quality.audio_wer(text, data, lang)
        if wer is not None and wer > self._asr_wer_max:
            raise RuntimeError(f"ASR WER {wer:.3f} vượt ngưỡng {self._asr_wer_max:.3f}")
        key = f"audio/{aid}/{lang}/{h}.mp3"
        self._storage.put(key, data)
        await self._audio.upsert_asset(
            aid,
            lang,
            h,
            voice,
            key,
            len(data),
            len(data) * 1000 // MP3_BYTES_PER_SECOND,
            _sha(data),
            self._clock(),
            asr_wer=wer,
        )

    async def _tour_assets(
        self, tour: dict[str, Any], lang: str
    ) -> tuple[list[dict[str, Any]], list[str]]:
        """Audio khớp nội dung đã duyệt hiện tại của mọi điểm; kèm danh sách điểm còn thiếu."""
        found: list[dict[str, Any]] = []
        missing: list[str] = []
        for point in tour["attractions"]:
            text = await self._approved_text(point["id"], lang)
            asset = (
                await self._audio.find_asset(point["id"], lang, text_hash(text)) if text else None
            )
            if asset:
                found.append({"point": point, "asset": asset})
            else:
                missing.append(point["name"])
        return found, missing

    async def _build_pack(self, p: dict[str, Any]) -> None:
        pack = await self._audio.get_pack(p["pack_id"])
        if pack is None:
            return
        tour = await self._tours.get(pack["tour_id"])
        if tour is None:
            return
        items, missing = await self._tour_assets(tour, pack["lang"])
        if missing or not items:
            await self._audio.update_pack(pack["id"], {"status": "failed"}, self._clock())
            raise RuntimeError(f"Thiếu audio: {', '.join(missing) or 'tour không có điểm'}")
        files = []
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_STORED) as z:
            for item in items:
                point, asset = item["point"], item["asset"]
                z.writestr(f"{point['id']}.mp3", self._storage.read(asset["storage_key"]))
                files.append(
                    {
                        "attraction_id": point["id"],
                        "name": point["name"],
                        "summary": point["summary"],
                        "lat": point["lat"],
                        "lng": point["lng"],
                        "radius": point["radius"],
                        "priority": point["priority"],
                        "is_preview": point["is_preview"],
                        "storage_key": asset["storage_key"],
                        "sha256": asset["sha256"],
                        "bytes": asset["bytes"],
                        "duration_ms": asset["duration_ms"],
                    }
                )
        manifest = json.dumps(
            {
                "pack_id": pack["id"],
                "tour_id": pack["tour_id"],
                "lang": pack["lang"],
                "version": pack["version"],
                "files": files,
            },
            ensure_ascii=False,
        ).encode()
        prefix = f"packs/{pack['tour_id']}/{pack['lang']}/{pack['version']}"
        data = archive.getvalue()
        self._storage.put(f"{prefix}/pack.zip", data)
        self._storage.put(f"{prefix}/manifest.json", manifest)
        await self._audio.update_pack(
            pack["id"],
            {
                "status": "qa",
                "archive_key": f"{prefix}/pack.zip",
                "manifest_key": f"{prefix}/manifest.json",
                "sha256": _sha(data),
                "total_bytes": sum(f["bytes"] for f in files),
                "file_count": len(files),
            },
            self._clock(),
        )
        if not self._verify_pack_files(files):
            await self._audio.update_pack(pack["id"], {"status": "failed"}, self._clock())
            raise RuntimeError("QA pack không đạt: file thiếu hoặc sai checksum")

    def _verify_pack_files(self, files: list[dict[str, Any]]) -> bool:
        return all(
            self._storage.exists(f["storage_key"])
            and _sha(self._storage.read(f["storage_key"])) == f["sha256"]
            for f in files
        )

    # --- UC-07: trạng thái cho Voice Studio
    async def audio_status(self) -> list[dict[str, Any]]:
        langs = [lang.code for lang in await self._languages.list_active()]
        approved = await self._translations.all_approved()
        texts = {(r["attraction_id"], r["target_lang"]): r["text"] for r in approved}
        assets = await self._audio.all_ready()
        by_key = {(a["attraction_id"], a["lang"], a["text_hash"]): a for a in assets}
        any_asset = {(a["attraction_id"], a["lang"]) for a in assets}
        jobs = await self._jobs.latest_by_prefix("audio:")
        out = []
        for a in await self._attractions.find_all(None, None):
            cells = {}
            for lang in langs:
                if lang == SOURCE_LANG:
                    is_ok = a.script_status.value == "approved"
                    text = a.script if is_ok else None
                else:
                    text = texts.get((a.id, lang))
                cells[lang] = self._cell(a.id, lang, text, by_key, any_asset, jobs)
            out.append({"id": a.id, "name": a.name, "langs": cells})
        return out

    @staticmethod
    def _cell(
        aid: str,
        lang: str,
        text: str | None,
        by_key: dict[tuple[str, str, str], dict[str, Any]],
        any_asset: set[tuple[str, str]],
        jobs: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        if text is None:
            state = "stale" if (aid, lang) in any_asset else "none"
            return {"state": state, "error": None, "duration_ms": None}
        h = text_hash(text)
        asset = by_key.get((aid, lang, h))
        if asset:
            return {"state": "ready", "error": None, "duration_ms": asset["duration_ms"]}
        job = jobs.get(f"audio:{aid}:{lang}:{h}")
        if job and job["status"] in ("queued", "running"):
            return {"state": job["status"], "error": None, "duration_ms": None}
        if job and job["status"] == "failed":
            error = (job["error"] or {}).get("message")
            return {"state": "failed", "error": error, "duration_ms": None}
        state = "stale" if (aid, lang) in any_asset else "none"
        return {"state": state, "error": None, "duration_ms": None}

    async def audio_preview_path(self, attraction_id: str, lang: str) -> str:
        text = await self._approved_text(attraction_id, lang)
        asset = await self._audio.find_asset(attraction_id, lang, text_hash(text)) if text else None
        if asset is None or not self._storage.exists(asset["storage_key"]):
            raise NotFoundError("audio_not_found", "Chưa có audio cho nội dung đã duyệt")
        return self.file_path(asset["storage_key"])

    async def retry_audio(self, attraction_id: str, lang: str, actor_id: str) -> None:
        text = await self._approved_text(attraction_id, lang)
        if text is None:
            raise InvalidContentError("not_approved", "Nội dung ngôn ngữ này chưa được duyệt")
        key = f"audio:{attraction_id}:{lang}:{text_hash(text)}"
        spec = job_spec("audio", key, {"attraction_id": attraction_id, "lang": lang})
        await self._jobs.enqueue([spec], actor_id, self._clock())

    # --- UC-09, UC-10
    async def list_packs(self, tour_id: str | None, lang: str | None) -> list[dict[str, Any]]:
        return await self._audio.find_packs(tour_id, lang)

    async def build_pack(self, tour_id: str, lang: str, actor_id: str) -> dict[str, Any]:
        tour = await self._tours.get(tour_id)
        if tour is None:
            raise NotFoundError("tour_not_found", "Không tìm thấy tour")
        _, missing = await self._tour_assets(tour, lang)
        if missing or not tour["attractions"]:
            detail = ", ".join(missing) or "tour chưa có điểm nào"
            raise InvalidContentError("audio_missing", f"Còn thiếu audio: {detail}")
        pack_id = await self._audio.create_pack(tour_id, lang, actor_id, self._clock())
        pack = await self._audio.get_pack(pack_id)
        assert pack is not None
        return pack

    async def _pack(self, pack_id: str) -> dict[str, Any]:
        pack = await self._audio.get_pack(pack_id)
        if pack is None:
            raise NotFoundError("pack_not_found", "Không tìm thấy pack")
        return pack

    async def publish_pack(self, pack_id: str, actor_id: str) -> dict[str, Any]:
        pack = await self._pack(pack_id)
        if pack["status"] != "qa":
            raise ConflictError("pack_not_ready", "Chỉ phát hành được pack đã qua QA")
        if not await self._audio.promote_pack(pack, "qa", actor_id, self._clock()):
            raise ConflictError("pack_not_ready", "Pack vừa thay đổi trạng thái, hãy tải lại")
        await self._audit.record(actor_id, "pack.publish", AuditResource("pack", pack_id))
        return await self._pack(pack_id)

    async def rollback_pack(self, pack_id: str, reason: str, actor_id: str) -> dict[str, Any]:
        pack = await self._pack(pack_id)
        if pack["status"] != "superseded":
            raise ConflictError("pack_not_superseded", "Chỉ rollback về bản đã bị thay thế")
        key, sha = pack["archive_key"], pack["sha256"]
        ok = key and self._storage.exists(key) and _sha(self._storage.read(key)) == sha
        if not ok:
            raise InvalidContentError("pack_files_invalid", "File thiếu hoặc sai checksum")
        if not await self._audio.promote_pack(pack, "superseded", actor_id, self._clock()):
            raise ConflictError("pack_not_superseded", "Pack vừa thay đổi trạng thái")
        await self._audit.record(actor_id, "pack.rollback", AuditResource("pack", pack_id), reason)
        return await self._pack(pack_id)

    def read_manifest(self, pack: dict[str, Any]) -> dict[str, Any]:
        result: dict[str, Any] = json.loads(self._storage.read(pack["manifest_key"]))
        return result

    def file_path(self, key: str) -> str:
        return str(self._storage.path(key))
