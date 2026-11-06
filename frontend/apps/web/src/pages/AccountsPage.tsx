import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen, Plus } from "lucide-react";
import { useState } from "react";
import { sendJson } from "../api";
import { useSession } from "../auth/session";
import { Badge, ErrorBox, Field, ghostBtn, inputClass, Page, primaryBtn, Table } from "../components/ui";

const ROLES = ["admin", "editor", "translator"];

export function AccountsPage() {
  const qc = useQueryClient();
  const me = useSession((s) => s.user?.id);
  const [form, setForm] = useState({ email: "", full_name: "", role: "editor", password: "" });
  const { data, error } = useQuery({ queryKey: ["users"], queryFn: () => sendJson<any[]>("/api/v1/admin/users"), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });
  const create = useMutation({
    mutationFn: () => sendJson("/api/v1/admin/users", "POST", form),
    onSuccess: () => { setForm({ email: "", full_name: "", role: "editor", password: "" }); return refresh(); },
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: string; is_active?: boolean }) => sendJson(`/api/v1/admin/users/${id}`, "PATCH", body),
    onSuccess: refresh,
  });
  return (
    <Page title="Tài khoản" subtitle="Đổi vai trò hoặc khoá tài khoản sẽ thu hồi mọi phiên ngay lập tức">
      <form className="bg-white border border-slate-200 rounded-xl p-5 mb-5 grid md:grid-cols-5 gap-3 items-end" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Field label="Email"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></Field>
        <Field label="Họ tên"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputClass} /></Field>
        <Field label="Vai trò">
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputClass}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Mật khẩu (tối thiểu 8 ký tự)"><input required minLength={8} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} /></Field>
        <button className={primaryBtn} disabled={create.isPending}><Plus size={15} aria-hidden /> Tạo</button>
      </form>
      <ErrorBox error={error ?? create.error ?? update.error} />
      {!!data?.length && (
        <Table head={["Email", "Họ tên", "Vai trò", "Trạng thái", "Đăng nhập gần nhất", ""]}>
          {data.map((u) => {
            const self = u.id === me;
            return (
              <tr key={u.id}>
                <td className="px-4 py-2.5 font-medium">{u.email}{self && " (bạn)"}</td>
                <td className="px-4 py-2.5">{u.full_name}</td>
                <td className="px-4 py-2.5">
                  <select aria-label={`Vai trò của ${u.email}`} disabled={self} value={u.role} onChange={(e) => update.mutate({ id: u.id, role: e.target.value })} className={`${inputClass} !py-1 w-32`}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2.5"><Badge tone={u.is_active ? "green" : "red"}>{u.is_active ? "Hoạt động" : "Đã khoá"}</Badge></td>
                <td className="px-4 py-2.5 text-slate-500">{u.last_login_at ? new Date(u.last_login_at).toLocaleString("vi-VN") : "-"}</td>
                <td className="px-4 py-2.5 text-right">
                  {!self && (
                    <button className={ghostBtn} onClick={() => update.mutate({ id: u.id, is_active: !u.is_active })}>
                      {u.is_active ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />} {u.is_active ? "Khoá" : "Mở khoá"}
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
