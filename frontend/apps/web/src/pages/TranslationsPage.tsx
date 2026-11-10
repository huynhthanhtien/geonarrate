import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Save, TriangleAlert, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { sendJson } from "../api";
import { Badge, Empty, ErrorBox, ghostBtn, inputClass, Page, primaryBtn } from "../components/ui";
import { useLanguages } from "../languages";

const STATUS = {
  pending: { label: "Chờ duyệt", tone: "amber" },
  approved: { label: "Đã duyệt", tone: "green" },
  rejected: { label: "Chưa đạt", tone: "red" },
} as const;

type TranslationJob = {
  poi_id: string; title: string; lang: string;
  status: "queued" | "running" | "failed"; attempts: number; error: string | null;
};

function flagText(flag: string) {
  if (flag === "mock_translation") return "Bản dịch giả để chạy thử, cần dịch thật";
  if (flag.startsWith("missing_term:")) return `Thiếu thuật ngữ: ${flag.slice(13)}`;
  return flag;
}

function Row({ t, showStatus }: { t: any; showStatus: (status: string) => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState(t.text);
  const [note, setNote] = useState("");
  useEffect(() => setText(t.text), [t.text]);
  const done = () => qc.invalidateQueries({ queryKey: ["translations"] });
  const save = useMutation({
    mutationFn: () => sendJson(`/api/v1/translations/${t.id}`, "PUT", { text }),
    onSuccess: () => {
      if (t.review_status === "rejected") showStatus("pending");
      return done();
    },
  });
  const approve = useMutation({
    mutationFn: async () => {
      if (text !== t.text) await sendJson(`/api/v1/translations/${t.id}`, "PUT", { text });
      return sendJson(`/api/v1/translations/${t.id}/approve`, "POST");
    },
    onSuccess: done,
  });
  const reject = useMutation({
    mutationFn: () => sendJson(`/api/v1/translations/${t.id}/reject`, "POST", { review_note: note }),
    onSuccess: () => { setNote(""); showStatus("rejected"); return done(); },
  });
  const status = STATUS[t.review_status as keyof typeof STATUS];
  const approved = t.review_status === "approved";
  return (
    <article className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-slate-800">{t.title}</h3>
        <Badge tone="blue">{t.target_lang}</Badge>
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="text-xs text-slate-400">v{t.version}</span>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Bản gốc</p>
          <p className="text-sm text-slate-700 whitespace-pre-line">{t.source_text}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Bản dịch</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} readOnly={approved} rows={4} className={inputClass} />
        </div>
      </div>
      {t.qa_flags.map((f: string) => (
        <p key={f} className="flex items-center gap-1.5 text-xs text-amber-700">
          <TriangleAlert size={13} aria-hidden /> {flagText(f)}
        </p>
      ))}
      {t.review_note && <p className="text-xs text-red-700">Ghi chú: {t.review_note}</p>}
      {t.review_status === "rejected" && (
        <p className="text-sm text-amber-700">Sửa bản dịch ở ô bên trên rồi chọn Lưu để chuyển về Chờ duyệt, hoặc chọn Duyệt sau khi sửa.</p>
      )}
      <ErrorBox error={save.error ?? approve.error ?? reject.error} />
      {!approved && (
        <div className="flex flex-wrap items-center gap-2">
          <button className={primaryBtn} disabled={approve.isPending} onClick={() => approve.mutate()}>
            <Check size={15} aria-hidden /> Duyệt
          </button>
          <button className={ghostBtn} disabled={save.isPending || text === t.text} onClick={() => save.mutate()}>
            <Save size={15} aria-hidden /> {t.review_status === "rejected" ? "Lưu và gửi duyệt lại" : "Lưu"}
          </button>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do chưa đạt..." className={`${inputClass} max-w-xs`} />
          <button className={ghostBtn} disabled={!note.trim() || reject.isPending} onClick={() => reject.mutate()}>
            <Undo2 size={15} aria-hidden /> Chưa đạt
          </button>
        </div>
      )}
    </article>
  );
}

export function TranslationsPage() {
  const languages = useLanguages();
  const [lang, setLang] = useState("");
  const [status, setStatus] = useState("pending");
  const q = new URLSearchParams();
  if (lang) q.set("lang", lang);
  if (status) q.set("status", status);
  const { data, error, isLoading } = useQuery({
    queryKey: ["translations", lang, status],
    queryFn: () => sendJson<any[]>(`/api/v1/translations?${q}`),
    retry: false,
    refetchInterval: 5000,
  });
  const jobs = useQuery({
    queryKey: ["translation-jobs"],
    queryFn: () => sendJson<TranslationJob[]>("/api/v1/translation-jobs"),
    refetchInterval: 5000,
    retry: false,
  });
  return (
    <Page title="Bản dịch" subtitle="Duyệt bản dịch thì hệ thống tự sinh audio">
      <p className="mb-3 text-sm text-slate-600">Chọn trạng thái “Chưa đạt” để tìm và sửa các bản dịch được trả lại.</p>
      {jobs.error && <ErrorBox error={jobs.error} />}
      {!!jobs.data?.length && (
        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4" aria-live="polite">
          <h2 className="mb-2 font-semibold text-slate-800">Tiến trình dịch</h2>
          <p className="mb-2 text-xs text-slate-500">Job chờ lâu có thể do worker chưa chạy hoặc đang xử lý việc khác.</p>
          <ul className="space-y-2">
            {jobs.data.filter((job) => !lang || job.lang === lang).map((job) => (
              <li key={`${job.poi_id}:${job.lang}`} className="text-sm text-slate-700">
                <span className="font-medium">{job.title}</span> · {job.lang} · {job.status === "running" ? "Đang dịch" : job.status === "queued" ? "Đang chờ" : "Dịch lỗi"}
                {job.error && <span className="block text-xs text-red-700">{job.status === "queued" ? "Lần thử trước: " : ""}{job.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex gap-3 mb-5 max-w-md">
        <select value={lang} onChange={(e) => setLang(e.target.value)} className={inputClass} aria-label="Ngôn ngữ">
          <option value="">Mọi ngôn ngữ</option>
          {languages.data?.filter((l) => !l.is_source).map((l) => <option key={l.code} value={l.code}>{l.native_name} ({l.code})</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass} aria-label="Trạng thái">
          <option value="">Mọi trạng thái</option>
          <option value="pending">Chờ duyệt</option>
          <option value="rejected">Chưa đạt</option>
          <option value="approved">Đã duyệt</option>
        </select>
      </div>
      <ErrorBox error={languages.error ?? error} />
      {data?.length === 0 && <Empty>Không có bản dịch nào.</Empty>}
      {isLoading && <p className="text-slate-400 text-sm">Đang tải...</p>}
      <div className="space-y-4">{data?.map((t) => <Row key={t.id} t={t} showStatus={setStatus} />)}</div>
    </Page>
  );
}
