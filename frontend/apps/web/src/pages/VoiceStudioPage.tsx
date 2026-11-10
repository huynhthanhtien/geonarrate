import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getAudioPreview, sendJson } from "../api";
import { Badge, Empty, ErrorBox, ghostBtn, Page, Table } from "../components/ui";
import { useLanguages } from "../languages";

const STATE = {
  none: { label: "Chưa có", tone: "gray" },
  queued: { label: "Đang chờ", tone: "blue" },
  running: { label: "Đang sinh", tone: "blue" },
  ready: { label: "Sẵn sàng", tone: "green" },
  failed: { label: "Lỗi", tone: "red" },
  stale: { label: "Đã cũ", tone: "amber" },
} as const;

type Preview = { poiId: string; name: string; lang: string };

function AudioPreview({ selection }: { selection: Preview }) {
  const { poiId, lang } = selection;
  const [source, setSource] = useState<string>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    getAudioPreview(poiId, lang, controller.signal).then((audio) => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(audio);
      setSource(url);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason);
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [poiId, lang]);

  if (error) return <ErrorBox error={error} />;
  if (!source) return <p role="status" className="text-sm text-slate-500">Đang tải audio…</p>;
  return <audio controls autoPlay src={source} aria-label={`Nghe thử ${selection.name} (${lang})`} />;
}

export function VoiceStudioPage() {
  const languages = useLanguages();
  const qc = useQueryClient();
  const [preview, setPreview] = useState<Preview | null>(null);
  const { data, error } = useQuery({
    queryKey: ["audio-status"],
    queryFn: () => sendJson<any[]>("/api/v1/audio/status"),
    retry: false,
    // Chỉ hỏi lại khi còn job đang chạy
    refetchInterval: (q) => {
      const rows = q.state.data as any[] | undefined;
      const busy = rows?.some((r) => Object.values<any>(r.langs).some((c) => c.state === "queued" || c.state === "running"));
      return busy ? 4000 : false;
    },
  });
  const retry = useMutation({
    mutationFn: (v: { poi_id: string; lang: string }) => sendJson("/api/v1/audio/retry", "POST", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audio-status"] }),
  });
  return (
    <Page title="Voice Studio" subtitle="Audio tự sinh sau khi nội dung được duyệt; nghe thử audio đã sẵn sàng ngay trên trang này">
      <ErrorBox error={languages.error ?? error ?? retry.error} />
      {preview && (
        <div className="mb-4 rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{preview.name} · {preview.lang}</p>
            <button className={ghostBtn} onClick={() => setPreview(null)}>Đóng</button>
          </div>
          <AudioPreview key={`${preview.poiId}:${preview.lang}`} selection={preview} />
        </div>
      )}
      {data?.length === 0 && <Empty>Chưa có điểm tham quan nào.</Empty>}
      {!!data?.length && (
        <Table head={["Điểm", ...(languages.data ?? []).map((l) => l.code)]}>
          {data.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-2.5 font-medium whitespace-nowrap">{row.name}</td>
              {(languages.data ?? []).map(({ code: lang }) => {
                const cell = row.langs[lang];
                if (!cell) return <td key={lang} className="px-4 py-2.5">-</td>;
                const s = STATE[cell.state as keyof typeof STATE];
                return (
                  <td key={lang} className="px-4 py-2.5 align-top">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    {cell.state === "ready" && (
                      <button className={`${ghostBtn} mt-1 !px-2 !py-0.5 !text-xs`} onClick={() => setPreview({ poiId: row.id, name: row.name, lang })}>
                        <Play size={12} aria-hidden /> Nghe thử
                      </button>
                    )}
                    {cell.error && <p className="text-xs text-red-600 mt-1 max-w-40 truncate" title={cell.error}>{cell.error}</p>}
                    {(cell.state === "failed" || cell.state === "stale") && (
                      <button className={`${ghostBtn} mt-1 !py-0.5 !px-2 !text-xs`} disabled={retry.isPending} onClick={() => retry.mutate({ poi_id: row.id, lang })}>
                        <RotateCw size={12} aria-hidden /> Thử lại
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
