import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Printer, Search, Ticket, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState, type FormEvent } from "react";
import { sendJson } from "../api";
import { Badge, ConfirmDialog, dangerBtn, Dialog, Empty, ErrorBox, Field, ghostBtn, inputClass, Page, primaryBtn, Table } from "../components/ui";
import { formatDate, formatDateTime } from "../labels";
import { MultiPicker } from "../components/MultiPicker";

/** Vé hoặc cả lô đang chờ xác nhận thu hồi: không hoàn tác được, máy đã kích hoạt mất quyền nghe. */
type Revoke = { ticket_id?: string; batch?: string; label: string };
type Tour = { id: string; name: string; access: string; status: string };
type Issued = { batch: string; codes: string[] };

const daysFromNow = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const PRESETS = [30, 90, 180];
const EMPTY = () => ({ batch: "", tour_ids: [] as string[], valid_until: daysFromNow(90), transfers_left: 1, count: 10 });

function IssueDialog({ open, tours, onClose, onIssued }: { open: boolean; tours: Tour[]; onClose: () => void; onIssued: (r: Issued) => void }) {
  const [form, setForm] = useState(EMPTY);
  const issue = useMutation({
    mutationFn: () => sendJson<Issued>("/api/v1/tickets", "POST", {
      ...form, batch: form.batch.trim(), valid_until: new Date(`${form.valid_until}T23:59:59`).toISOString(),
    }),
    onSuccess: (r) => { setForm(EMPTY()); onIssued(r); },
  });
  const close = () => { issue.reset(); onClose(); };
  // Tour trả phí mới cần vé; xếp lên trước
  const sorted = [...tours].sort((a, b) => Number(b.access === "paid") - Number(a.access === "paid"));
  const ready = form.batch.trim() && form.tour_ids.length && form.count >= 1 && form.valid_until;
  const submit = (e: FormEvent) => { e.preventDefault(); if (ready) issue.mutate(); };

  return (
    <Dialog open={open} title="Phát hành lô vé" onClose={close} size="lg">
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Tên lô">
          <input required placeholder="vd: QUAY-1, DOITAC-ABC-T11" value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} className={inputClass} />
          <span className="mt-1 block text-xs text-slate-500">Dùng để tra cứu và thu hồi cả lô sau này.</span>
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Tour áp dụng</legend>
          <MultiPicker
            value={form.tour_ids}
            onChange={(tour_ids) => setForm({ ...form, tour_ids })}
            placeholder="Tìm tour…"
            emptyText="Chưa có tour trả phí nào."
            revealLabel="Hiện cả tour miễn phí"
            items={sorted.map((t) => ({
              id: t.id,
              label: t.name,
              hidden: t.access !== "paid",
              meta: (
                <span className="flex shrink-0 gap-1.5 text-xs text-slate-400">
                  {t.access !== "paid" && <span>miễn phí</span>}
                  {t.status !== "published" && <span>nháp</span>}
                </span>
              ),
            }))}
          />
          {form.tour_ids.some((id) => tours.find((t) => t.id === id)?.access !== "paid") && (
            <p className="mt-2 text-xs text-amber-700">Tour miễn phí không cần vé; vé chỉ có tác dụng với tour trả phí.</p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Hạn dùng">
            <input required type="date" min={daysFromNow(0)} value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className={inputClass} />
            <span className="mt-1.5 flex gap-1.5">
              {PRESETS.map((d) => (
                <button key={d} type="button" onClick={() => setForm({ ...form, valid_until: daysFromNow(d) })}
                  className={`rounded-md border px-2 py-0.5 text-xs ${form.valid_until === daysFromNow(d) ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {d} ngày
                </button>
              ))}
            </span>
          </Field>
          <Field label="Số lượng vé">
            <input required type="number" min={1} max={1000} value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} className={inputClass} />
            <span className="mt-1 block text-xs text-slate-500">Tối đa 1.000 vé mỗi lô.</span>
          </Field>
          <Field label="Lượt chuyển máy">
            <input type="number" min={0} max={10} value={form.transfers_left} onChange={(e) => setForm({ ...form, transfers_left: Number(e.target.value) })} className={inputClass} />
            <span className="mt-1 block text-xs text-slate-500">Số lần vé được chuyển sang máy khác sau khi kích hoạt.</span>
          </Field>
        </div>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {ready
            ? <>Sẽ tạo <strong>{form.count}</strong> vé cho <strong>{form.tour_ids.length}</strong> tour, dùng đến hết ngày <strong>{formatDate(`${form.valid_until}T23:59:59`)}</strong>. Mã gốc chỉ hiện một lần ngay sau khi tạo để in.</>
            : "Nhập tên lô và chọn ít nhất một tour."}
        </p>
        <ErrorBox error={issue.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={close}>Huỷ</button>
          <button className={primaryBtn} disabled={issue.isPending || !ready}><Ticket size={15} aria-hidden /> {issue.isPending ? "Đang tạo…" : `Phát hành ${form.count || ""} vé`}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function TicketsPage() {
  const qc = useQueryClient();
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const tours = useQuery({ queryKey: ["tours"], queryFn: () => sendJson<Tour[]>("/api/v1/tours"), retry: false });
  const tickets = useQuery({
    queryKey: ["tickets", q],
    queryFn: () => sendJson<any[]>(`/api/v1/tickets${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["tickets"] });
  const [confirming, setConfirming] = useState<Revoke | null>(null);
  const revoke = useMutation({
    mutationFn: ({ ticket_id, batch }: Revoke) => sendJson("/api/v1/tickets/revoke", "POST", { ticket_id, batch }),
    onSuccess: () => { setConfirming(null); return refresh(); },
  });
  const tourNames = (ids: string[] = []) =>
    ids.map((id) => tours.data?.find((t) => t.id === id)?.name ?? "?").join(", ") || "-";
  const rows = tickets.data ?? [];
  const active = rows.filter((t) => t.status === "active").length;
  const used = rows.filter((t) => t.activated_at).length;

  return (
    <Page
      title="Vé QR"
      subtitle="Phát hành theo lô cho quầy hoặc đối tác, tra cứu và thu hồi"
      action={<button className={primaryBtn} onClick={() => setIssuing(true)}><Ticket size={15} aria-hidden /> Phát hành lô vé</button>}
    >
      <ErrorBox error={tickets.error ?? revoke.error} />
      {issued && (
        <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div>
              <p className="font-semibold text-amber-900">Đã tạo {issued.codes.length} vé cho lô {issued.batch}</p>
              <p className="text-sm text-amber-800">Mã gốc chỉ hiện một lần này. Hãy in ngay trước khi đóng.</p>
            </div>
            <div className="flex gap-2">
              <button className={primaryBtn} onClick={() => window.print()}><Printer size={14} aria-hidden /> In vé</button>
              <button className={ghostBtn} onClick={() => setIssued(null)}><X size={14} aria-hidden /> Đóng</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {issued.codes.map((c) => (
              <figure key={c} className="rounded-lg bg-white p-2 text-center">
                <QRCodeSVG value={c} size={110} className="mx-auto" />
                <figcaption className="mt-1 break-all font-mono text-[10px]">{c}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form className="flex w-full max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); }}>
          <label className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="4 ký tự cuối của mã, hoặc tên lô" className={`${inputClass} !pl-8`} aria-label="Tìm vé" />
          </label>
          <button className={ghostBtn}>Tìm</button>
          {q && <button type="button" className={ghostBtn} onClick={() => { setSearch(""); setQ(""); }}>Bỏ lọc</button>}
        </form>
        {q && rows.some((t) => t.batch === q && t.status === "active") && (
          <button type="button" className={dangerBtn} onClick={() => setConfirming({ batch: q, label: `cả lô ${q}` })}><Ban size={14} aria-hidden /> Thu hồi lô {q}</button>
        )}
        {!!rows.length && <p className="ml-auto text-sm text-slate-500">{rows.length} vé · {active} hiệu lực · {used} đã kích hoạt</p>}
      </div>

      {tickets.data?.length === 0 && <Empty>{q ? "Không tìm thấy vé nào." : "Chưa có vé nào. Bấm “Phát hành lô vé” để tạo."}</Empty>}
      {!!rows.length && (
        <Table head={["Mã", "Lô", "Tour", "Hạn", "Kích hoạt", "Máy", "Lượt chuyển", "Trạng thái", ""]}>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2.5 font-mono">…{t.code_hint}</td>
              <td className="px-4 py-2.5">
                <button className="text-teal-700 hover:underline" title="Lọc theo lô này" onClick={() => { setSearch(t.batch); setQ(t.batch); }}>{t.batch}</button>
              </td>
              <td className="max-w-48 truncate px-4 py-2.5" title={tourNames(t.tour_ids)}>{tourNames(t.tour_ids)}</td>
              <td className="whitespace-nowrap px-4 py-2.5">{formatDate(t.valid_until)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{t.activated_at ? formatDateTime(t.activated_at) : "Chưa quét"}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-slate-500" title={t.device_id ?? undefined}>{t.device_id ? `${t.device_id.slice(0, 8)}…` : "-"}</td>
              <td className="px-4 py-2.5">{t.transfers_left}</td>
              <td className="px-4 py-2.5"><Badge tone={t.status === "active" ? "green" : "red"}>{t.status === "active" ? "Hiệu lực" : "Đã thu hồi"}</Badge></td>
              <td className="px-4 py-2.5 text-right">
                {t.status === "active" && (
                  <button className="text-sm font-medium text-red-700 hover:underline" onClick={() => setConfirming({ ticket_id: t.id, label: `vé …${t.code_hint}` })}>Thu hồi</button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <IssueDialog open={issuing} tours={tours.data ?? []} onClose={() => setIssuing(false)}
        onIssued={(r) => { setIssuing(false); setIssued(r); void refresh(); }} />
      <ConfirmDialog
        open={!!confirming}
        title={`Thu hồi ${confirming?.label ?? ""}`}
        confirmLabel="Thu hồi"
        danger
        busy={revoke.isPending}
        onConfirm={() => confirming && revoke.mutate(confirming)}
        onClose={() => setConfirming(null)}
      >
        <p>Không hoàn tác được. Máy đã kích hoạt sẽ mất quyền tải và nghe các tour trả phí của vé này.</p>
      </ConfirmDialog>
    </Page>
  );
}
