import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Lock, LockOpen, Pencil, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { sendJson } from "../api";
import { useSession } from "../auth/session";
import { Badge, ConfirmDialog, Dialog, ErrorBox, Field, ghostBtn, inputClass, Page, primaryBtn, Table } from "../components/ui";
import { formatDateTime, roleLabel, ROLES } from "../labels";


/** Thay đổi đang chờ xác nhận: đổi vai trò hoặc khoá/mở khoá đều thu hồi mọi phiên của người đó. */
type Pending = { id: string; email: string; roles?: string[]; is_active?: boolean };
type Account = { id: string; email: string };

const EMPTY = { email: "", full_name: "", roles: ["editor"] as string[], password: "", confirm: "" };
const MIN_PASSWORD = 8;

/** Lỗi nhập mật khẩu hiển thị ngay trong popup, trước khi gửi lên máy chủ. */
function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`;
  if (password !== confirm) return "Hai lần nhập mật khẩu không khớp.";
  return null;
}

function CreateAccountDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState(false);
  const create = useMutation({
    mutationFn: () => sendJson("/api/v1/admin/users", "POST", {
      email: form.email, full_name: form.full_name, roles: form.roles, password: form.password,
    }),
    onSuccess: () => { setForm(EMPTY); setTouched(false); onCreated(); },
  });
  const problem = passwordProblem(form.password, form.confirm);
  const close = () => { setForm(EMPTY); setTouched(false); create.reset(); onClose(); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!problem && form.roles.length) create.mutate();
  };
  return (
    <Dialog open={open} title="Tạo tài khoản" onClose={close}>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Email"><input required type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></Field>
        <Field label="Họ tên"><input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputClass} /></Field>
        <Field label="Vai trò">
          <div className="flex flex-wrap gap-4">{ROLES.map((r) => <label key={r} className="flex items-center gap-1"><input type="checkbox" checked={form.roles.includes(r)} onChange={(e) => setForm({ ...form, roles: e.target.checked ? [...form.roles, r] : form.roles.filter((v) => v !== r) })} />{roleLabel(r)}</label>)}</div>
          {form.roles.length === 0 && <p className="text-sm text-red-600">Chọn ít nhất một vai trò.</p>}
        </Field>
        <Field label={`Mật khẩu (tối thiểu ${MIN_PASSWORD} ký tự)`}><input required type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} /></Field>
        <Field label="Nhập lại mật khẩu"><input required type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} className={inputClass} /></Field>
        {touched && problem && <p className="text-sm text-red-600" role="alert">{problem}</p>}
        <ErrorBox error={create.error} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={ghostBtn} onClick={close}>Huỷ</button>
          <button className={primaryBtn} disabled={create.isPending}><Plus size={15} aria-hidden /> {create.isPending ? "Đang tạo…" : "Tạo tài khoản"}</button>
        </div>
      </form>
    </Dialog>
  );
}

function PasswordDialog({ account, self, onClose }: { account: Account | null; self: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);
  const save = useMutation({
    mutationFn: () => sendJson(`/api/v1/admin/users/${account!.id}/password`, "POST", { password }),
    onSuccess: () => setDone(true),
  });
  const problem = passwordProblem(password, confirm);
  const close = () => { setPassword(""); setConfirm(""); setTouched(false); setDone(false); save.reset(); onClose(); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!problem) save.mutate();
  };
  return (
    <Dialog open={!!account} title={`Đặt lại mật khẩu ${account?.email ?? ""}`} onClose={close}>
      {done ? (
        <>
          <p role="status">Đã đổi mật khẩu.{self ? "" : " Người này phải đăng nhập lại bằng mật khẩu mới."}</p>
          <div className="mt-5 flex justify-end"><button type="button" className={primaryBtn} onClick={close}>Đóng</button></div>
        </>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <p>{self ? "Phiên đăng nhập hiện tại của bạn vẫn giữ nguyên." : "Mọi phiên đăng nhập hiện tại của người này sẽ bị thu hồi."}</p>
          <Field label={`Mật khẩu mới (tối thiểu ${MIN_PASSWORD} ký tự)`}><input required type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} /></Field>
          <Field label="Nhập lại mật khẩu mới"><input required type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} /></Field>
          {touched && problem && <p className="text-sm text-red-600" role="alert">{problem}</p>}
          <ErrorBox error={save.error} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={ghostBtn} onClick={close}>Huỷ</button>
            <button className={primaryBtn} disabled={save.isPending}><KeyRound size={15} aria-hidden /> {save.isPending ? "Đang lưu…" : "Đổi mật khẩu"}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function RolesDialog({ account, onClose, onSaved }: { account: Account & { roles: string[] }; onClose: () => void; onSaved: () => void }) {
  const [roles, setRoles] = useState<string[]>(account.roles);
  const changed = roles.length !== account.roles.length || roles.some((role) => !account.roles.includes(role));
  const save = useMutation({
    mutationFn: () => sendJson(`/api/v1/admin/users/${account.id}`, "PATCH", { roles }),
    onSuccess: onSaved,
  });
  return (
    <Dialog open title={`Vai trò của ${account.email}`} onClose={onClose}>
      <p className="mb-4 text-sm text-slate-600">Chọn một hoặc nhiều vai trò cho tài khoản này.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ROLES.map((role) => (
          <label key={role} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50">
            <input type="checkbox" className="accent-teal-700" checked={roles.includes(role)} onChange={(e) => setRoles(e.target.checked ? [...roles, role] : roles.filter((r) => r !== role))} />
            {roleLabel(role)}
          </label>
        ))}
      </div>
      {roles.length === 0 && <p className="mt-2 text-sm text-red-600">Chọn ít nhất một vai trò.</p>}
      <p className="mt-4 text-sm text-slate-500">Sau khi lưu, người này cần đăng nhập lại.</p>
      <ErrorBox error={save.error} />
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={ghostBtn} onClick={onClose}>Huỷ</button>
        <button type="button" className={primaryBtn} disabled={!roles.length || !changed || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Đang lưu…" : "Lưu vai trò"}</button>
      </div>
    </Dialog>
  );
}

export function AccountsPage() {
  const qc = useQueryClient();
  const me = useSession((s) => s.user?.id);
  const [creating, setCreating] = useState(false);
  const [rolesFor, setRolesFor] = useState<(Account & { roles: string[] }) | null>(null);
  const [passwordFor, setPasswordFor] = useState<Account | null>(null);
  const { data, error } = useQuery({ queryKey: ["users"], queryFn: () => sendJson<any[]>("/api/v1/admin/users"), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });
  const [pending, setPending] = useState<Pending | null>(null);
  const update = useMutation({
    mutationFn: ({ id, roles, is_active }: Pending) => sendJson(`/api/v1/admin/users/${id}`, "PATCH", { roles, is_active }),
    onSuccess: () => { setPending(null); return refresh(); },
  });
  return (
    <Page
      title="Tài khoản"
      subtitle="Đổi vai trò hoặc khoá tài khoản sẽ thu hồi mọi phiên ngay lập tức"
      action={<button className={primaryBtn} onClick={() => setCreating(true)}><Plus size={15} aria-hidden /> Tạo tài khoản</button>}
    >
      <ErrorBox error={error ?? update.error} />
      {!!data?.length && (
        <Table head={["Email", "Họ tên", "Vai trò", "Trạng thái", "Đăng nhập gần nhất", ""]}>
          {data.map((u) => {
            const self = u.id === me;
            return (
              <tr key={u.id}>
                <td className="px-4 py-2.5 font-medium">{u.email}{self && " (bạn)"}</td>
                <td className="px-4 py-2.5">{u.full_name}</td>
                <td className="px-4 py-2.5">
                  <div className="flex max-w-64 flex-wrap items-center gap-1.5">
                    {u.roles.map((role: string) => <Badge key={role} tone="blue">{roleLabel(role)}</Badge>)}
                    {!self && <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50" onClick={() => setRolesFor({ id: u.id, email: u.email, roles: u.roles })} aria-label={`Sửa vai trò của ${u.email}`}><Pencil size={13} aria-hidden /> Sửa</button>}
                  </div>
                </td>
                <td className="px-4 py-2.5"><Badge tone={u.is_active ? "green" : "red"}>{u.is_active ? "Hoạt động" : "Đã khoá"}</Badge></td>
                <td className="px-4 py-2.5 text-slate-500">{formatDateTime(u.last_login_at)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-2">
                    {self ? (
                      <span className="self-center text-xs text-slate-400">Đổi mật khẩu của bạn ở thanh trên cùng</span>
                    ) : (
                      <button className={ghostBtn} onClick={() => setPasswordFor({ id: u.id, email: u.email })}>
                        <KeyRound size={14} aria-hidden /> Đặt lại mật khẩu
                      </button>
                    )}
                    {!self && (
                      <button className={ghostBtn} onClick={() => setPending({ id: u.id, email: u.email, is_active: !u.is_active })}>
                        {u.is_active ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />} {u.is_active ? "Khoá" : "Mở khoá"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      <CreateAccountDialog open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />
      {rolesFor && <RolesDialog account={rolesFor} onClose={() => setRolesFor(null)} onSaved={() => { setRolesFor(null); void refresh(); }} />}
      <PasswordDialog account={passwordFor} self={passwordFor?.id === me} onClose={() => setPasswordFor(null)} />
      <ConfirmDialog
        open={!!pending}
        title={pending?.roles ? `Đổi vai trò ${pending.email}` : pending?.is_active === false ? `Khoá ${pending?.email}` : `Mở khoá ${pending?.email ?? ""}`}
        confirmLabel={pending?.roles ? `Đổi thành ${pending.roles.map(roleLabel).join(", ")}` : pending?.is_active === false ? "Khoá tài khoản" : "Mở khoá"}
        danger={pending?.is_active === false}
        busy={update.isPending}
        onConfirm={() => pending && update.mutate(pending)}
        onClose={() => setPending(null)}
      >
        {pending?.is_active === true
          ? <p>Người này đăng nhập lại được ngay.</p>
          : <p>Mọi phiên đăng nhập hiện tại của người này bị thu hồi ngay; họ phải đăng nhập lại{pending?.is_active === false ? " và sẽ không đăng nhập được cho tới khi mở khoá" : ""}.</p>}
      </ConfirmDialog>
    </Page>
  );
}
