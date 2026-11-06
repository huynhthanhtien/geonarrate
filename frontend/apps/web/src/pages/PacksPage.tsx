import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hammer, History, Send } from "lucide-react";
import { useState } from "react";
import { sendJson } from "../api";
import { ALL_LANGS, Badge, Empty, ErrorBox, Field, ghostBtn, inputClass, Page, primaryBtn, Table } from "../components/ui";

const STATUS = {
  building: { label: "Đang build", tone: "blue" },
  qa: { label: "Chờ phát hành", tone: "amber" },
  published: { label: "Đang phát hành", tone: "green" },
  superseded: { label: "Bản cũ", tone: "gray" },
  failed: { label: "Lỗi", tone: "red" },
} as const;

export function PacksPage() {
  const qc = useQueryClient();
  const [tourId, setTourId] = useState("");
  const [lang, setLang] = useState("vi");
  const tours = useQuery({ queryKey: ["tours"], queryFn: () => sendJson<any[]>("/api/v1/tours"), retry: false });
  const packs = useQuery({
    queryKey: ["packs"],
    queryFn: () => sendJson<any[]>("/api/v1/packs"),
    retry: false,
    refetchInterval: (q) => ((q.state.data as any[] | undefined)?.some((p) => p.status === "building") ? 3000 : false),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["packs"] });
  const build = useMutation({ mutationFn: () => sendJson("/api/v1/packs/build", "POST", { tour_id: tourId, lang }), onSuccess: refresh });
  const publish = useMutation({ mutationFn: (id: string) => sendJson(`/api/v1/packs/${id}/publish`, "POST"), onSuccess: refresh });
  const rollback = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => sendJson(`/api/v1/packs/${id}/rollback`, "POST", { reason }),
    onSuccess: refresh,
  });
  const tourName = (id: string) => tours.data?.find((t) => t.id === id)?.name ?? id;
  return (
    <Page title="Pack" subtitle="Gom audio của tour theo ngôn ngữ, kiểm tra rồi phát hành">
      <form className="bg-white border border-slate-200 rounded-xl p-5 mb-5 flex flex-wrap gap-3 items-end" onSubmit={(e) => { e.preventDefault(); build.mutate(); }}>
        <div className="w-64">
          <Field label="Tour">
            <select required value={tourId} onChange={(e) => setTourId(e.target.value)} className={inputClass}>
              <option value="">Chọn tour</option>
              {tours.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="w-28">
          <Field label="Ngôn ngữ">
            <select value={lang} onChange={(e) => setLang(e.target.value)} className={inputClass}>
              {ALL_LANGS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </Field>
        </div>
        <button className={primaryBtn} disabled={build.isPending}><Hammer size={15} aria-hidden /> Build pack</button>
      </form>
      <ErrorBox error={packs.error ?? build.error ?? publish.error ?? rollback.error} />
      {packs.data?.length === 0 && <Empty>Chưa có pack nào.</Empty>}
      {!!packs.data?.length && (
        <Table head={["Tour", "Ngôn ngữ", "Version", "Trạng thái", "File", "Dung lượng", ""]}>
          {packs.data.map((p) => {
            const s = STATUS[p.status as keyof typeof STATUS];
            return (
              <tr key={p.id}>
                <td className="px-4 py-2.5 font-medium">{tourName(p.tour_id)}</td>
                <td className="px-4 py-2.5">{p.lang}</td>
                <td className="px-4 py-2.5">v{p.version}</td>
                <td className="px-4 py-2.5"><Badge tone={s.tone}>{s.label}</Badge></td>
                <td className="px-4 py-2.5">{p.file_count ?? "-"}</td>
                <td className="px-4 py-2.5">{p.total_bytes != null ? `${(p.total_bytes / 1024 / 1024).toFixed(1)} MB` : "-"}</td>
                <td className="px-4 py-2.5 text-right">
                  {p.status === "qa" && <button className={primaryBtn} disabled={publish.isPending} onClick={() => publish.mutate(p.id)}><Send size={14} aria-hidden /> Phát hành</button>}
                  {p.status === "superseded" && (
                    <button
                      className={ghostBtn}
                      onClick={() => {
                        const reason = prompt("Lý do rollback?");
                        if (reason?.trim()) rollback.mutate({ id: p.id, reason });
                      }}
                    >
                      <History size={14} aria-hidden /> Rollback
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </Page>
  );
}
