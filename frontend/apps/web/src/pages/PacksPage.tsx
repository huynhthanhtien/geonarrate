import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Hammer, History, Languages, Send } from "lucide-react";
import { useState } from "react";
import { sendJson } from "../api";
import { Badge, Empty, ErrorBox, Field, ghostBtn, inputClass, Page, primaryBtn, Table } from "../components/ui";
import { useLanguages } from "../languages";

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
  const [langs, setLangs] = useState<string[]>([]);
  const languages = useLanguages();
  const available = languages.data ?? [];
  const selected = langs.filter((code) => available.some((language) => language.code === code));
  const [buildResults, setBuildResults] = useState<{ lang: string; error: string | null }[]>([]);
  const tours = useQuery({ queryKey: ["tours"], queryFn: () => sendJson<any[]>("/api/v1/tours"), retry: false });
  const packs = useQuery({
    queryKey: ["packs"],
    queryFn: () => sendJson<any[]>("/api/v1/packs"),
    retry: false,
    refetchInterval: (q) => ((q.state.data as any[] | undefined)?.some((p) => p.status === "building") ? 3000 : false),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["packs"] });
  const build = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(selected.map((lang) => sendJson("/api/v1/packs/build", "POST", { tour_id: tourId, lang })));
      return results.map((result, index) => ({
        lang: selected[index]!,
        error: result.status === "rejected" ? (result.reason instanceof Error ? result.reason.message : "Không thể tạo pack") : null,
      }));
    },
    onMutate: () => setBuildResults([]),
    onSuccess: (results) => { setBuildResults(results); return refresh(); },
  });
  const publish = useMutation({ mutationFn: (id: string) => sendJson(`/api/v1/packs/${id}/publish`, "POST"), onSuccess: refresh });
  const rollback = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => sendJson(`/api/v1/packs/${id}/rollback`, "POST", { reason }),
    onSuccess: refresh,
  });
  const tourName = (id: string) => tours.data?.find((t) => t.id === id)?.name ?? id;
  return (
    <Page title="Pack" subtitle="Gom audio của tour theo ngôn ngữ, kiểm tra rồi phát hành">
      <form className="mb-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6" onSubmit={(e) => { e.preventDefault(); build.mutate(); }}>
        <div className="mb-5 flex items-start gap-3">
          <span className="rounded-lg bg-teal-50 p-2 text-teal-700"><Languages size={19} aria-hidden /></span>
          <div>
            <h2 className="font-semibold text-slate-800">Tạo pack mới</h2>
            <p className="mt-1 text-sm text-slate-500">Chọn tour và ngôn ngữ cần tạo nội dung.</p>
          </div>
        </div>
        <div className="max-w-md">
          <Field label="Tour">
            <select required value={tourId} onChange={(e) => setTourId(e.target.value)} className={inputClass}>
              <option value="">Chọn tour</option>
              {tours.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-slate-600">Ngôn ngữ</legend>
          <div className="flex flex-wrap items-center gap-2">
            {available.map(({ code: l, native_name }) => (
              <label key={l} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-500 ${langs.includes(l) ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-slate-50"}`}>
                <input className="sr-only" type="checkbox" checked={langs.includes(l)} onChange={(e) => setLangs((current) => e.target.checked ? [...current, l] : current.filter((item) => item !== l))} />
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${langs.includes(l) ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white"}`}>
                  {langs.includes(l) && <Check size={12} aria-hidden />}
                </span>
                {native_name} <span className="text-xs opacity-70">({l})</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className="text-slate-500">Đã chọn {selected.length}/{available.length}</span>
            <button type="button" disabled={!available.length} className="font-medium text-teal-700 hover:text-teal-900 hover:underline disabled:opacity-50" onClick={() => setLangs(selected.length === available.length ? [] : available.map((l) => l.code))}>
              {available.length > 0 && selected.length === available.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </button>
          </div>
        </fieldset>
        <div className="mt-5 border-t border-slate-100 pt-4">
          <button className={primaryBtn} disabled={build.isPending || selected.length === 0}><Hammer size={15} aria-hidden /> {build.isPending ? "Đang tạo..." : "Build pack"}</button>
        </div>
      </form>
      {!!buildResults.length && <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm" role="status">
        {buildResults.map((result) => <p key={result.lang} className={result.error ? "text-red-700" : "text-green-700"}>{result.lang}: {result.error ?? "Đã đưa vào hàng đợi build"}</p>)}
      </div>}
      <ErrorBox error={languages.error ?? tours.error ?? packs.error ?? build.error ?? publish.error ?? rollback.error} />
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
