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
from app.repositories.audio_repo import SqlAudioRepository
from app.repositories.glossary_repo import SqlGlossaryRepository
from app.repositories.job_repo import MAX_ATTEMPTS, SqlJobRepository, job_spec, text_hash
from app.repositories.language_repo import LanguageRepository
from app.repositories.poi_repo import PoiRepository
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
        pois: PoiRepository,
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
        asr_wer_max: float = 0.08,
    ) -> None:
        self._jobs = jobs
        self._pois = pois
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
            payload = dict(job["payload"] or {})
            if "poi_id" not in payload and "attraction_id" in payload:
                payload["poi_id"] = payload.pop("attraction_id")
            await handler(payload)
        except Exception as e:  # lỗi nhà cung cấp, mạng, đĩa: ghi lại để thử lại hoặc báo CMS
            await self._jobs.fail(job["id"], job["attempts"], str(e) or repr(e), self._clock())
            if job["type"] == "pack_build" and job["attempts"] >= MAX_ATTEMPTS:
                await self._audio.update_pack(
                    job["payload"]["pack_id"],
                    {"status": "failed"},
                    self._clock(),
                    expected="building",
                )
            return True
        await self._jobs.finish(job["id"], self._clock())
        return True

    async def translation_progress(self) -> list[dict[str, Any]]:
        rows = await self._jobs.translation_progress()
        return [
            {
                "poi_id": row["poi_id"],
                "title": row["title"],
                "lang": row["lang"],
                "status": row["status"],
                "attempts": row["attempts"],
                "error": (row["error"] or {}).get("message"),
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]

    async def _translate(self, p: dict[str, Any]) -> None:
        poi = await self._pois.get(p["poi_id"])
        if poi is None or poi.script_status.value != "approved":
            return
        source_hash = text_hash(poi.script)
        if p.get("source_hash", source_hash) != source_hash:
            return
        rows = await self._glossary.for_translation(p["poi_id"], p["lang"])
        terms = [GlossaryTerm(r["term"], r["translation"], r["is_required"]) for r in rows]
        text = await self._translator.translate(poi.script, SOURCE_LANG, p["lang"], terms)
        latest = await self._pois.get(p["poi_id"])
        if (
            latest is None
            or latest.script_status.value != "approved"
            or text_hash(latest.script) != source_hash
        ):
            return
        flags = qa_flags(poi.script, text, rows, self._translator.name)
        await self._translations.upsert_machine(
            p["poi_id"],
            p["lang"],
            text,
            self._translator.name,
            flags,
            text_hash(text),
            self._clock(),
        )

    async def _approved_text(self, poi_id: str, lang: str) -> str | None:
        if lang == SOURCE_LANG:
            a = await self._pois.get(poi_id)
            approved = a is not None and a.script_status.value == "approved"
            return a.script if approved and a is not None else None
        row = await self._translations.approved_for(poi_id, lang)
        return row["text"] if row else None

    async def _generate_audio(self, p: dict[str, Any]) -> None:
        aid, lang = p["poi_id"], p["lang"]
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
        for point in tour["pois"]:
            text = await self._approved_text(point["id"], lang)
            asset = (
                await self._audio.find_asset(point["id"], lang, text_hash(text)) if text else None
            )
            if asset:
                found.append({"point": point, "asset": asset})
            else:
                missing.append(point["name"])
        return found, missing

    @staticmethod
    def _manifest_files(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Danh sách file của manifest; dùng cả để so pack mới với các bản đã có."""
        return [
            {
                "poi_id": point["id"],
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
            for point, asset in ((item["point"], item["asset"]) for item in items)
        ]

    async def _build_pack(self, p: dict[str, Any]) -> None:
        pack = await self._audio.get_pack(p["pack_id"])
        if pack is None or pack["status"] != "building":
            return  # job chạy lại (worker kẹt hoặc chết sau khi lưu): không build đè bản đã QA
        tour = await self._tours.get(pack["tour_id"])
        if tour is None:
            return
        items, missing = await self._tour_assets(tour, pack["lang"])
        if missing or not items:
            raise RuntimeError(f"Thiếu audio: {', '.join(missing) or 'tour không có điểm'}")
        files = self._manifest_files(items)
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_STORED) as z:
            for f in files:
                z.writestr(f"{f['poi_id']}.mp3", self._storage.read(f["storage_key"]))
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
        if not self._verify_pack_files(files):
            raise RuntimeError("QA pack không đạt: file thiếu hoặc sai checksum")
        if (
            not self._storage.exists(f"{prefix}/pack.zip")
            or _sha(self._storage.read(f"{prefix}/pack.zip")) != _sha(data)
            or not self._storage.exists(f"{prefix}/manifest.json")
            or self._storage.read(f"{prefix}/manifest.json") != manifest
        ):
            raise RuntimeError("QA pack không đạt: gói hoặc manifest lưu không đúng")
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
            expected="building",
        )

    def _verify_pack_files(self, files: list[dict[str, Any]]) -> bool:
        return all(
            self._storage.exists(f["storage_key"])
            and _sha(self._storage.read(f["storage_key"])) == f["sha256"]
            for f in files
        )

    def _pack_intact(self, pack: dict[str, Any]) -> bool:
        """Gói zip và từng file audio mà app tải (theo manifest) còn đúng checksum."""
        key, manifest_key = pack["archive_key"], pack["manifest_key"]
        if not key or not manifest_key or not self._storage.exists(key):
            return False
        if (
            not self._storage.exists(manifest_key)
            or _sha(self._storage.read(key)) != pack["sha256"]
        ):
            return False
        return self._verify_pack_files(self.read_manifest(pack).get("files", []))

    # --- UC-07: trạng thái cho Voice Studio
    async def audio_status(self) -> list[dict[str, Any]]:
        langs = [lang.code for lang in await self._languages.list_active()]
        approved = await self._translations.all_approved()
        texts = {(r["poi_id"], r["target_lang"]): r["text"] for r in approved}
        assets = await self._audio.all_ready()
        by_key = {(a["poi_id"], a["lang"], a["text_hash"]): a for a in assets}
        any_asset = {(a["poi_id"], a["lang"]) for a in assets}
        jobs = await self._jobs.latest_by_prefix("audio:")
        out = []
        for a in await self._pois.find_all(None, None):
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

    async def audio_preview_path(self, poi_id: str, lang: str) -> str:
        text = await self._approved_text(poi_id, lang)
        asset = await self._audio.find_asset(poi_id, lang, text_hash(text)) if text else None
        if asset is None or not self._storage.exists(asset["storage_key"]):
            raise NotFoundError("audio_not_found", "Chưa có audio cho nội dung đã duyệt")
        return self.file_path(asset["storage_key"])

    async def retry_audio(self, poi_id: str, lang: str, actor_id: str) -> None:
        text = await self._approved_text(poi_id, lang)
        if text is None:
            raise InvalidContentError("not_approved", "Nội dung ngôn ngữ này chưa được duyệt")
        key = f"audio:{poi_id}:{lang}:{text_hash(text)}"
        spec = job_spec("audio", key, {"poi_id": poi_id, "lang": lang})
        await self._jobs.enqueue([spec], actor_id, self._clock())

    # --- UC-09, UC-10
    async def list_packs(self, tour_id: str | None, lang: str | None) -> list[dict[str, Any]]:
        return await self._audio.find_packs(tour_id, lang)

    async def build_pack(self, tour_id: str, lang: str, actor_id: str) -> dict[str, Any]:
        tour = await self._tours.get(tour_id)
        if tour is None:
            raise NotFoundError("tour_not_found", "Không tìm thấy tour")
        items, missing = await self._tour_assets(tour, lang)
        if missing or not tour["pois"]:
            detail = ", ".join(missing) or "tour chưa có điểm nào"
            raise InvalidContentError("audio_missing", f"Còn thiếu audio: {detail}")
        files = self._manifest_files(items)
        for p in await self._audio.find_packs(tour_id, lang):
            if p["status"] in ("qa", "published") and p["manifest_key"]:
                if self.read_manifest(p).get("files") == files:
                    raise ConflictError(
                        "pack_unchanged",
                        f"Nội dung giống version {p['version']} ({p['status']}), không cần build",
                    )
        pack_id = await self._audio.create_pack(tour_id, lang, actor_id, self._clock())
        if pack_id is None:
            raise ConflictError("pack_building", "Đang có pack build cho tour và ngôn ngữ này")
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
        current = await self._audio.published_pack(pack["tour_id"], pack["lang"])
        if current is not None and current["version"] > pack["version"]:
            raise ConflictError(
                "pack_outdated",
                f"Đang phát hành version {current['version']} mới hơn; muốn quay lại hãy rollback",
            )
        if not self._pack_intact(pack):
            raise InvalidContentError("pack_files_invalid", "File thiếu hoặc sai checksum")
        if not await self._audio.promote_pack(pack, "qa", actor_id, self._clock()):
            raise ConflictError("pack_not_ready", "Pack vừa thay đổi trạng thái, hãy tải lại")
        await self._audit.record(actor_id, "pack.publish", AuditResource("pack", pack_id))
        return await self._pack(pack_id)

    async def rollback_pack(self, pack_id: str, reason: str, actor_id: str) -> dict[str, Any]:
        pack = await self._pack(pack_id)
        if pack["status"] != "superseded":
            raise ConflictError("pack_not_superseded", "Chỉ rollback về bản đã bị thay thế")
        if not self._pack_intact(pack):
            raise InvalidContentError("pack_files_invalid", "File thiếu hoặc sai checksum")
        if not await self._audio.promote_pack(pack, "superseded", actor_id, self._clock()):
            raise ConflictError("pack_not_superseded", "Pack vừa thay đổi trạng thái")
        await self._audit.record(actor_id, "pack.rollback", AuditResource("pack", pack_id), reason)
        return await self._pack(pack_id)

    def read_manifest(self, pack: dict[str, Any]) -> dict[str, Any]:
        result: dict[str, Any] = json.loads(self._storage.read(pack["manifest_key"]))
        for item in result.get("files", []):
            if "poi_id" not in item and "attraction_id" in item:
                item["poi_id"] = item.pop("attraction_id")
        return result

    def file_path(self, key: str) -> str:
        return str(self._storage.path(key))
