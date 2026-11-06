import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Printer, Search, Ticket } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { sendJson } from "../api";
import { Badge, dangerBtn, Empty, ErrorBox, Field, ghostBtn, inputClass, Page, primaryBtn, Table } from "../components/ui";

const in90Days = () => new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

export function TicketsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ batch: "", tour_ids: [] as string[], valid_until: in90Days(), transfers_left: 1, count: 10 });
  const [issued, setIssued] = useState<{ batch: string; codes: string[] } | null>(null);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const tours = useQuery({ queryKey: ["tours"], queryFn: () => sendJson<any[]>("/api/v1/tours"), retry: false });
  const tickets = useQuery({
    queryKey: ["tickets", q],
    queryFn: () => sendJson<any[]>(`/api/v1/tickets${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["tickets"] });
  const issue = useMutation({
    mutationFn: () =>
      sendJson<{ batch: string; codes: string[] }>("/api/v1/tickets", "POST", {
        ...form,
        valid_until: new Date(`${form.valid_until}T23:59:59`).toISOString(),
      }),
    onSuccess: (r) => { setIssued(r); return refresh(); },
  });
  const revoke = useMutation({
    mutationFn: (b: { ticket_id?: string; batch?: string }) => sendJson("/api/v1/tickets/revoke", "POST", b),
    onSuccess: refresh,
  });
  return (
    <Page title="Vé QR" subtitle="Phát hành theo lô cho quầy hoặc đối tác, tra cứu và thu hồi">
      <form className="bg-white border border-slate-200 rounded-xl p-5 mb-5 space-y-3" onSubmit={(e) => { e.preventDefault(); issue.mutate(); }}>
        <div className="grid md:grid-cols-4 gap-3">
          <Field label="Lô"><input required placeholder="vd: QUAY-1" value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} className={inputClass} /></Field>
          <Field label="Hạn dùng"><input required type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className={inputClass} /></Field>
          <Field label="Lượt chuyển máy"><input type="number" min={0} max={10} value={form.transfers_left} onChange={(e) => setForm({ ...form, transfers_left: Number(e.target.value) })} className={inputClass} /></Field>
          <Field label="Số lượng"><input type="number" min={1} max={1000} value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} className={inputClass} /></Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
          {tours.data?.map((t) => (
            <label key={t.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.tour_ids.includes(t.id)}
                onChange={(e) => setForm({ ...form, tour_ids: e.target.checked ? [...form.tour_ids, t.id] : form.tour_ids.filter((x) => x !== t.id) })}
              />
              {t.name}
            </label>
          ))}
          {tours.data?.length === 0 && <span className="text-slate-400">Chưa có tour nào.</span>}
        </div>
        <button className={primaryBtn} disabled={issue.isPending || !form.tour_ids.length}><Ticket size={15} aria-hidden /> Phát hành</button>
      </form>
      <ErrorBox error={tickets.error ?? issue.error ?? revoke.error} />
      {issued && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-3 print:hidden">
            <p className="text-sm font-semibold text-amber-800">Lô {issued.batch}: mã gốc chỉ hiện một lần này, hãy in ngay.</p>
            <div className="flex gap-2">
              <button className={ghostBtn} onClick={() => window.print()}><Printer size={14} aria-hidden /> In</button>
              <button className={ghostBtn} onClick={() => setIssued(null)}>Đóng</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {issued.codes.map((c) => (
              <figure key={c} className="bg-white p-2 rounded-lg text-center">
                <QRCodeSVG value={c} size={110} className="mx-auto" />
                <figcaption className="text-[10px] font-mono mt-1 break-all">{c}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
      <form className="flex gap-2 mb-3 max-w-md" onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="4 ký tự cuối của mã, hoặc tên lô" className={inputClass} aria-label="Tìm vé" />
        <button className={ghostBtn}><Search size={14} aria-hidden /> Tìm</button>
        {q && <button type="button" className={dangerBtn} onClick={() => { if (confirm(`Thu hồi cả lô ${q}?`)) revoke.mutate({ batch: q }); }}><Ban size={14} aria-hidden /> Thu hồi lô</button>}
      </form>
      {tickets.data?.length === 0 && <Empty>Không có vé nào.</Empty>}
      {!!tickets.data?.length && (
        <Table head={["Mã", "Lô", "Hạn", "Máy", "Lượt chuyển", "Trạng thái", ""]}>
          {tickets.data.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2.5 font-mono">...{t.code_hint}</td>
              <td className="px-4 py-2.5">{t.batch}</td>
              <td className="px-4 py-2.5">{new Date(t.valid_until).toLocaleDateString("vi-VN")}</td>
              <td className="px-4 py-2.5 text-slate-500">{t.device_id ?? "Chưa quét"}</td>
              <td className="px-4 py-2.5">{t.transfers_left}</td>
              <td className="px-4 py-2.5"><Badge tone={t.status === "active" ? "green" : "red"}>{t.status === "active" ? "Hiệu lực" : "Đã thu hồi"}</Badge></td>
              <td className="px-4 py-2.5 text-right">
                {t.status === "active" && <button className={dangerBtn} onClick={() => revoke.mutate({ ticket_id: t.id })}>Thu hồi</button>}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
