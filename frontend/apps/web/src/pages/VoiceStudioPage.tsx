import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { sendJson } from "../api";
import { ALL_LANGS, Badge, Empty, ErrorBox, ghostBtn, Page, Table } from "../components/ui";

const STATE = {
  none: { label: "Chưa có", tone: "gray" },
  queued: { label: "Đang chờ", tone: "blue" },
  running: { label: "Đang sinh", tone: "blue" },
  ready: { label: "Sẵn sàng", tone: "green" },
  failed: { label: "Lỗi", tone: "red" },
  stale: { label: "Đã cũ", tone: "amber" },
} as const;

export function VoiceStudioPage() {
  const qc = useQueryClient();
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
    mutationFn: (v: { attraction_id: string; lang: string }) => sendJson("/api/v1/audio/retry", "POST", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audio-status"] }),
  });
  return (
    <Page title="Voice Studio" subtitle="Audio tự sinh sau khi nội dung được duyệt; trang này để theo dõi và thử lại">
      <ErrorBox error={error ?? retry.error} />
      {data?.length === 0 && <Empty>Chưa có điểm tham quan nào.</Empty>}
      {!!data?.length && (
        <Table head={["Điểm", ...ALL_LANGS]}>
          {data.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-2.5 font-medium whitespace-nowrap">{row.name}</td>
              {ALL_LANGS.map((lang) => {
                const cell = row.langs[lang];
                if (!cell) return <td key={lang} className="px-4 py-2.5">-</td>;
                const s = STATE[cell.state as keyof typeof STATE];
                return (
                  <td key={lang} className="px-4 py-2.5 align-top">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    {cell.error && <p className="text-xs text-red-600 mt-1 max-w-40 truncate" title={cell.error}>{cell.error}</p>}
                    {(cell.state === "failed" || cell.state === "stale") && (
                      <button className={`${ghostBtn} mt-1 !py-0.5 !px-2 !text-xs`} disabled={retry.isPending} onClick={() => retry.mutate({ attraction_id: row.id, lang })}>
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
