import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Loader2, MapPin, RotateCw, Save, TriangleAlert, Undo2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { sendJson } from "../api";
import { useCan } from "../auth/session";
import { Badge, Dialog, Empty, ErrorBox, ghostBtn, inputClass, Page, primaryBtn } from "../components/ui";
import { useLangName, useLanguages } from "../languages";
import { Select } from "../components/Select";

type Status = "pending" | "rejected" | "approved";
type Translation = {
  id: string; poi_id: string; title: string; target_lang: string; version: number;
  source_text: string; text: string; provider: string | null; qa_flags: string[];
  review_status: Status; review_note: string | null;
};
type Term = { id: string; term: string; target_lang: string; translation: string; is_required: boolean; poi_id: string | null };
type TranslationJob = {
  poi_id: string; title: string; lang: string;
  status: "queued" | "running" | "failed"; attempts: number; error: string | null;
};

const STATUS: Record<Status, { label: string; tone: "amber" | "green" | "red" }> = {
  pending: { label: "Chờ duyệt", tone: "amber" },
  rejected: { label: "Bị trả lại", tone: "red" },
  approved: { label: "Đã duyệt", tone: "green" },
};
const STATUS_ORDER: Status[] = ["pending", "rejected", "approved"];
const ALL = "all";

const has = (haystack: string, needle: string) => haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Tô màu các thuật ngữ trong đoạn văn (không phân biệt hoa thường). */
function highlight(text: string, words: string[]): ReactNode {
  const list = [...new Set(words.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!list.length) return text;
  const parts = text.split(new RegExp(`(${list.map(escapeRe).join("|")})`, "gi"));
  return parts.map((part, i) =>
    list.some((w) => w.toLocaleLowerCase() === part.toLocaleLowerCase())
      ? <mark key={i} className="rounded bg-amber-100 px-0.5 text-slate-900">{part}</mark>
      : part,
  );
}

function flagText(flag: string) {
  if (flag === "mock_translation") return "Bản dịch giả để chạy thử, cần dịch thật";
  return flag;
}

function TranslationCard({ t, terms, showLang }: { t: Translation; terms: Term[]; showLang: boolean }) {
  const langName = useLangName();
  const canWrite = useCan()("translation:write");
  const canApprove = useCan()("translation:approve");
  const qc = useQueryClient();
  const [text, setText] = useState(t.text);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => setText(t.text), [t.text]);
  const dirty = text !== t.text;
  const done = () => qc.invalidateQueries({ queryKey: ["translations"] });
  const save = useMutation({ mutationFn: () => sendJson(`/api/v1/translations/${t.id}`, "PUT", { text }), onSuccess: done });
  const approve = useMutation({
    mutationFn: async () => {
      if (dirty) await sendJson(`/api/v1/translations/${t.id}`, "PUT", { text });
      return sendJson(`/api/v1/translations/${t.id}/approve`, "POST");
    },
    onSuccess: done,
  });
  const reject = useMutation({
    mutationFn: () => sendJson(`/api/v1/translations/${t.id}/reject`, "POST", { review_note: note.trim() }),
    onSuccess: () => { setRejecting(false); setNote(""); return done(); },
  });
  // Thuật ngữ áp dụng cho điểm này và xuất hiện trong bản gốc (backend cũng chỉ bắt các từ này)
  const relevant = terms.filter((g) => (g.poi_id === null || g.poi_id === t.poi_id) && has(t.source_text, g.term));
  const missingRequired = relevant.filter((g) => g.is_required && !has(text, g.translation)).length;
  const flags = t.qa_flags.filter((f) => !f.startsWith("missing_term:"));
  const approved = t.review_status === "approved";
  const warnings = missingRequired + flags.length;

  return (
    <article className="rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <h3 className="font-semibold text-slate-800">{t.title}</h3>
        {showLang && <Badge tone="blue">{langName(t.target_lang)}</Badge>}
        <Badge tone={STATUS[t.review_status].tone}>{STATUS[t.review_status].label}</Badge>
        <span className="text-xs text-slate-400">v{t.version}{t.provider ? ` · ${t.provider}` : ""}</span>
        {warnings > 0 && !approved && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-amber-700">
            <TriangleAlert size={13} aria-hidden /> {warnings} cảnh báo
          </span>
        )}
      </header>
      <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Bản gốc (Tiếng Việt)</p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{highlight(t.source_text, relevant.map((g) => g.term))}</p>
        </div>
        <div>
          <p className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
            Bản dịch
            {dirty && <span className="text-amber-700">Đã sửa · chưa lưu</span>}
          </p>
          {approved || !canWrite
            ? <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{highlight(t.text, relevant.map((g) => g.translation))}</p>
            : <textarea aria-label={`Bản dịch ${t.title}`} value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(12, Math.max(4, Math.ceil(t.source_text.length / 70)))} className={inputClass} />}
        </div>
      </div>
      {(relevant.length > 0 || flags.length > 0 || t.review_note) && (
        <div className="space-y-1.5 px-5 pb-4 text-xs">
          {relevant.map((g) => {
            const ok = has(text, g.translation);
            return (
              <p key={g.id} className={`flex flex-wrap items-center gap-1.5 ${ok ? "text-slate-500" : g.is_required ? "text-red-700" : "text-amber-700"}`}>
                {ok ? <CheckCircle2 size={13} aria-hidden /> : <XCircle size={13} aria-hidden />}
                Thuật ngữ{g.is_required ? " bắt buộc" : ""}: <strong>{g.term}</strong> → <strong>{g.translation}</strong>
                {!ok && " — chưa có trong bản dịch"}
              </p>
            );
          })}
          {flags.map((f) => (
            <p key={f} className="flex items-center gap-1.5 text-amber-700"><TriangleAlert size={13} aria-hidden /> {flagText(f)}</p>
          ))}
          {t.review_note && <p className="text-red-700">Lý do trả lại: {t.review_note}</p>}
        </div>
      )}
      {!approved && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
          {canApprove && <button className={primaryBtn} disabled={approve.isPending} title={missingRequired ? "Còn thiếu thuật ngữ bắt buộc: hệ thống sẽ chặn duyệt" : undefined} onClick={() => approve.mutate()}>
            <Check size={15} aria-hidden /> {dirty ? "Lưu và duyệt" : "Duyệt"}
          </button>}
          {canWrite && <button className={ghostBtn} disabled={save.isPending || !dirty} onClick={() => save.mutate()}>
            <Save size={15} aria-hidden /> {t.review_status === "rejected" ? "Lưu và gửi duyệt lại" : "Lưu"}
          </button>}
          {canApprove && t.review_status === "pending" && (
            <button className={`${ghostBtn} ml-auto`} onClick={() => setRejecting(true)}>
              <Undo2 size={15} aria-hidden /> Trả lại
            </button>
          )}
          <div className="w-full"><ErrorBox error={save.error ?? approve.error ?? reject.error} /></div>
        </footer>
      )}
      <Dialog open={rejecting} title={`Trả lại bản dịch ${t.title}`} onClose={() => setRejecting(false)}>
        <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) reject.mutate(); }}>
          <label className="block">
            <span className="mb-1 block font-medium text-slate-700">Lý do (người dịch sẽ thấy)</span>
            <textarea required value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputClass} placeholder="Ví dụ: dịch sai tên riêng, thiếu câu thứ hai" />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={ghostBtn} onClick={() => setRejecting(false)}>Huỷ</button>
            <button className={primaryBtn} disabled={!note.trim() || reject.isPending}><Undo2 size={15} aria-hidden /> Trả lại</button>
          </div>
        </form>
      </Dialog>
    </article>
  );
}

export function TranslationsPage() {
  const canWrite = useCan()("translation:write");
  const canReadGlossary = useCan()("glossary:read");
  const qc = useQueryClient();
  const languages = useLanguages();
  const langName = useLangName();
  const [lang, setLang] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("pending");
  const [poi, setPoi] = useState("");
  const all = useQuery({
    queryKey: ["translations"],
    queryFn: () => sendJson<Translation[]>("/api/v1/translations"),
    retry: false,
    refetchInterval: 5000,
  });
  const glossary = useQuery({ queryKey: ["glossaries"], queryFn: () => sendJson<Term[]>("/api/v1/glossaries"), enabled: canReadGlossary, retry: false });
  const jobs = useQuery({
    queryKey: ["translation-jobs"],
    queryFn: () => sendJson<TranslationJob[]>("/api/v1/translation-jobs"),
    refetchInterval: 5000,
    retry: false,
  });
  const rerun = useMutation({
    mutationFn: (j: TranslationJob) => sendJson("/api/v1/translation-jobs/retry", "POST", { poi_id: j.poi_id, lang: j.lang }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["translation-jobs"] }),
  });

  const targets = (languages.data ?? []).filter((l) => !l.is_source);
  const rows = all.data ?? [];
  // Bộ lọc theo điểm áp dụng cho cả số đếm trên tab, để số luôn khớp danh sách bên dưới
  const scoped = poi ? rows.filter((t) => t.poi_id === poi) : rows;
  const count = (code: string, s: Status) =>
    scoped.filter((t) => (code === ALL || t.target_lang === code) && t.review_status === s).length;
  const current = lang ?? ALL;
  const visible = useMemo(
    () => scoped.filter((t) => (current === ALL || t.target_lang === current) && t.review_status === status),
    [scoped, current, status],
  );
  // Danh sách điểm có bản dịch, kèm số bản chờ duyệt
  const points = useMemo(() => {
    const byId = new Map<string, { title: string; pending: number }>();
    for (const t of rows) {
      const p = byId.get(t.poi_id) ?? { title: t.title, pending: 0 };
      if (t.review_status === "pending") p.pending += 1;
      byId.set(t.poi_id, p);
    }
    return [...byId.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title, "vi"));
  }, [rows]);
  const pendingTotal = rows.filter((t) => t.review_status === "pending").length;
  const rejectedTotal = rows.filter((t) => t.review_status === "rejected").length;
  const failed = (jobs.data ?? []).filter((j) => j.status === "failed");
  const busy = (jobs.data ?? []).filter((j) => j.status !== "failed");

  return (
    <Page title="Bản dịch" subtitle={`Duyệt bản dịch thì hệ thống tự sinh audio · Chờ duyệt: ${pendingTotal} · Bị trả lại: ${rejectedTotal}`}>
      <ErrorBox error={languages.error ?? all.error ?? jobs.error ?? rerun.error} />

      {failed.length > 0 && (
        <section className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4" aria-live="polite">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-800"><XCircle size={16} aria-hidden /> {failed.length} bản dịch máy bị lỗi</h2>
          <ul className="space-y-2">
            {failed.map((j) => (
              <li key={`${j.poi_id}:${j.lang}`} className="flex flex-wrap items-center gap-2 text-sm text-red-900">
                <span className="font-medium">{j.title}</span> · {langName(j.lang)}
                {j.error && <span className="text-xs text-red-700">— {j.error}</span>}
                <button className={`${ghostBtn} ml-auto !py-1`} disabled={!canWrite || rerun.isPending} onClick={() => rerun.mutate(j)}>
                  <RotateCw size={13} aria-hidden /> Chạy lại
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {busy.length > 0 && (
        <p className="mb-4 flex items-center gap-2 text-sm text-sky-700" role="status">
          <Loader2 size={15} className="animate-spin" aria-hidden /> Đang dịch máy {busy.length} bản: {busy.slice(0, 3).map((j) => `${j.title} (${j.lang})`).join(", ")}{busy.length > 3 ? "…" : ""}
        </p>
      )}

      <div role="tablist" aria-label="Ngôn ngữ" className="mb-3 flex flex-wrap gap-2">
        {[{ code: ALL, native_name: "Tất cả ngôn ngữ" }, ...targets].map((l) => {
          const n = count(l.code, "pending");
          const active = l.code === current;
          return (
            <button key={l.code} role="tab" aria-selected={active} onClick={() => setLang(l.code)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${active ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {l.native_name} {l.code !== ALL && <span className="text-xs opacity-60">({l.code})</span>}
              {n > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Trạng thái">
          {STATUS_ORDER.map((s) => (
            <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
              className={`rounded-md px-3 py-1 text-sm ${status === s ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {STATUS[s].label} <span className="opacity-70">{count(current, s)}</span>
            </button>
          ))}
        </div>
        <div className="w-full max-w-xs">
          <Select ariaLabel="Lọc theo điểm" icon={<MapPin size={14} aria-hidden />} value={poi} onChange={setPoi}
            options={[{ value: "", label: "Mọi điểm" }, ...points.map(([id, p]) => ({ value: id, label: p.title, hint: p.pending ? `${p.pending} chờ duyệt` : undefined }))]} />
        </div>
      </div>

      {all.isLoading && <p className="text-sm text-slate-400">Đang tải…</p>}
      {!all.isLoading && visible.length === 0 && (
        <Empty>{status === "pending" ? `Không còn bản dịch${current === ALL ? "" : ` ${langName(current)}`} nào chờ duyệt.` : "Không có bản dịch nào."}</Empty>
      )}
      <div className="space-y-4">
        {visible.map((t) => (
          <TranslationCard key={t.id} t={t} showLang={current === ALL} terms={(glossary.data ?? []).filter((g) => g.target_lang === t.target_lang)} />
        ))}
      </div>
    </Page>
  );
}
