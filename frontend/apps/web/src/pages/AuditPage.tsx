import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, sendJson } from "../api";
import { Empty, ErrorBox, Field, Page, Table, ghostBtn, inputClass, primaryBtn } from "../components/ui";

const PAGE_SIZE = 50;
const INITIAL_FILTERS = { actor_id: "", resource_type: "", resource_id: "", action: "", q: "", from: "", to: "" };
const ACTIONS: Record<string, string> = {
  "attraction.create": "Thêm điểm tham quan", "attraction.update": "Sửa điểm tham quan",
  "script.submit": "Gửi duyệt kịch bản", "script.approve": "Duyệt kịch bản", "script.reject": "Từ chối kịch bản",
  "translation.approve": "Duyệt bản dịch", "translation.reject": "Từ chối bản dịch",
  "tour.create": "Tạo tour", "tour.update": "Sửa tour", "pack.publish": "Phát hành pack", "pack.rollback": "Khôi phục pack",
  "ticket.issue": "Phát hành vé", "ticket.revoke": "Thu hồi vé", "user.create": "Tạo tài khoản", "user.update": "Sửa tài khoản", "user.lock": "Khoá tài khoản",
};
const RESOURCES: Record<string, string> = { attraction: "Điểm tham quan", translation: "Bản dịch", tour: "Tour", pack: "Pack", ticket: "Vé", ticket_batch: "Lô vé", user: "Tài khoản" };
interface User { id: string; full_name: string; email: string; }
interface Cursor { ts: string; id: string; }

function dateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function boundary(value: string, nextDay = false): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export function AuditPage() {
  const [draft, setDraft] = useState(INITIAL_FILTERS);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [validation, setValidation] = useState("");
  const before = cursors.at(-1);
  const users = useQuery({ queryKey: ["users"], queryFn: () => sendJson<User[]>("/api/v1/admin/users"), retry: false });
  const userById = new Map(users.data?.map((user) => [user.id, user]));
  const logs = useQuery({
    queryKey: ["audit", filters, before],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/audit", {
        params: { query: {
          limit: PAGE_SIZE + 1, before: before?.ts, before_id: before?.id,
          actor_id: filters.actor_id || undefined, resource_type: filters.resource_type || undefined,
          resource_id: filters.resource_id || undefined, action: filters.action || undefined,
          q: filters.q || undefined, since: boundary(filters.from), until: boundary(filters.to, true),
        } },
      });
      if (error) throw new Error("Không tải được nhật ký. Hãy thử lại.");
      return data ?? [];
    },
  });
  const rows = logs.data?.slice(0, PAGE_SIZE) ?? [];
  const last = rows.at(-1);
  const next = (logs.data?.length ?? 0) > PAGE_SIZE && last ? { ts: last.ts, id: last.id } : undefined;
  const hasFilters = Object.values(filters).some(Boolean);
  const pendingChanges = JSON.stringify(draft) !== JSON.stringify(filters);

  function apply(value: typeof INITIAL_FILTERS) {
    if (value.from && value.to && value.from > value.to) {
      setValidation("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu."); return;
    }
    setValidation("");
    const normalized = { ...value, q: value.q.trim(), resource_id: value.resource_id.trim() };
    setDraft(normalized); setFilters(normalized); setCursors([]);
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); apply(draft); }
  function preset(days: number | null) {
    if (days === null) { apply({ ...draft, from: "", to: "" }); return; }
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - days + 1);
    apply({ ...draft, from: dateInput(start), to: dateInput(end) });
  }

  return (
    <Page title="Nhật ký thao tác" subtitle="Tra cứu ai đã làm gì, với đối tượng nào và vào lúc nào">
      <form className="mb-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4" onSubmit={submit}>
        <div className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Tìm kiếm"><input maxLength={200} className={inputClass} value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="Tên, email, mã đối tượng, ghi chú…" /></Field>
          <Field label="Người thực hiện"><select aria-label="Người thực hiện" className={inputClass} value={draft.actor_id} onChange={(e) => setDraft({ ...draft, actor_id: e.target.value })} disabled={users.isPending}>
            <option value="">Tất cả người thực hiện</option>
            {users.data?.map((user) => <option key={user.id} value={user.id}>{user.full_name ? `${user.full_name} · ` : ""}{user.email}</option>)}
          </select></Field>
          <Field label="Hành động"><select aria-label="Hành động" className={inputClass} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
            <option value="">Tất cả hành động</option>{Object.entries(ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></Field>
          <Field label="Đối tượng"><select aria-label="Đối tượng" className={inputClass} value={draft.resource_type} onChange={(e) => setDraft({ ...draft, resource_type: e.target.value, resource_id: "" })}>
            <option value="">Tất cả đối tượng</option>{Object.entries(RESOURCES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></Field>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Từ ngày"><input type="date" className={inputClass} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field>
          <Field label="Đến hết ngày"><input type="date" className={inputClass} min={draft.from || undefined} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-2 pb-0.5" role="group" aria-label="Khoảng thời gian nhanh">
            <button type="button" className={ghostBtn} onClick={() => preset(1)}>Hôm nay</button>
            <button type="button" className={ghostBtn} onClick={() => preset(7)}>7 ngày</button>
            <button type="button" className={ghostBtn} onClick={() => preset(30)}>30 ngày</button>
            <button type="button" className={ghostBtn} onClick={() => preset(null)}>Mọi thời điểm</button>
          </div>
        </div>
        <details className="text-sm text-slate-500">
          <summary className="cursor-pointer">Tìm chính xác theo mã đối tượng</summary>
          <input aria-label="Mã đối tượng chính xác" className={`${inputClass} mt-2 max-w-lg`} placeholder="Không bắt buộc — chỉ dùng khi đã biết mã" value={draft.resource_id} onChange={(e) => setDraft({ ...draft, resource_id: e.target.value })} />
        </details>
        {users.isError && <p className="text-sm text-amber-700">Không tải được danh sách người dùng. Bạn vẫn có thể tìm bằng tên hoặc email trong ô tìm kiếm.</p>}
        {validation && <p role="alert" className="text-sm text-red-700">{validation}</p>}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <button className={primaryBtn}><Search size={15} aria-hidden /> Áp dụng bộ lọc</button>
          <button type="button" className={ghostBtn} onClick={() => apply(INITIAL_FILTERS)}><RotateCcw size={15} aria-hidden /> Xoá bộ lọc</button>
          {pendingChanges && <span className="text-xs text-amber-700">Có thay đổi chưa áp dụng</span>}
          <span className="ml-auto text-xs text-slate-500">Thời gian theo múi giờ trên máy của bạn</span>
        </div>
      </form>
      <ErrorBox error={logs.error} />
      {logs.isPending && <p role="status" className="py-8 text-slate-500">Đang tải nhật ký…</p>}
      {logs.isSuccess && rows.length === 0 && <Empty>{hasFilters ? "Không có thao tác khớp bộ lọc. Hãy đổi khoảng thời gian hoặc xoá bộ lọc." : "Chưa có thao tác nào."}</Empty>}
      {rows.length > 0 && <>
        <p className="mb-3 text-sm text-slate-500">Trang {cursors.length + 1} · {rows.length} thao tác{hasFilters ? " khớp bộ lọc" : ""}{logs.isFetching ? " · Đang cập nhật…" : ""}</p>
        <Table head={["Thời điểm", "Người thực hiện", "Hành động", "Đối tượng", "Ghi chú"]}>
          {rows.map((log) => {
            const user = userById.get(log.actor_id);
            return <tr key={log.id}>
              <td className="whitespace-nowrap px-4 py-3">{new Date(log.ts).toLocaleString("vi-VN")}</td>
              <td className="px-4 py-3" title={log.actor_id}>{user ? <><span className="font-medium">{user.full_name || user.email}</span>{user.full_name && <span className="block text-xs text-slate-500">{user.email}</span>}</> : <span className="text-slate-500">Tài khoản {log.actor_id.slice(0, 8)}…</span>}</td>
              <td className="px-4 py-3">{ACTIONS[log.action] ?? log.action}</td>
              <td className="px-4 py-3"><span>{RESOURCES[log.resource.type] ?? log.resource.type}</span><code className="block text-xs text-slate-400" title={log.resource.id}>{log.resource.id}</code></td>
              <td className="max-w-sm whitespace-pre-wrap break-words px-4 py-3 text-slate-600">{log.note || "—"}</td>
            </tr>;
          })}
        </Table>
      </>}
      {(rows.length > 0 || cursors.length > 0) && <nav aria-label="Phân trang nhật ký" className="mt-4 flex items-center gap-3">
        <button className={ghostBtn} disabled={!before || logs.isFetching} onClick={() => setCursors((pages) => pages.slice(0, -1))}>Trang trước</button>
        <span className="text-sm text-slate-500">Trang {cursors.length + 1}</span>
        <button className={ghostBtn} disabled={!next || logs.isFetching} onClick={() => next && setCursors((pages) => [...pages, next])}>Trang sau</button>
      </nav>}
    </Page>
  );
}
