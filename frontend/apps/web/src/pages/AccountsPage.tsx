import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Lock, LockOpen, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { sendJson } from "../api";
import { useSession } from "../auth/session";
import { Badge, ConfirmDialog, Dialog, ErrorBox, Field, ghostBtn, inputClass, Page, primaryBtn, Table } from "../components/ui";
import { formatDateTime, roleLabel, ROLES } from "../labels";
import { Select } from "../components/Select";

/** Thay đổi đang chờ xác nhận: đổi vai trò hoặc khoá/mở khoá đều thu hồi mọi phiên của người đó. */
type Pending = { id: string; email: string; role?: string; is_active?: boolean };
type Account = { id: string; email: string };

const EMPTY = { email: "", full_name: "", role: "editor", password: "", confirm: "" };
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
      email: form.email, full_name: form.full_name, role: form.role, password: form.password,
    }),
    onSuccess: () => { setForm(EMPTY); setTouched(false); onCreated(); },
  });
  const problem = passwordProblem(form.password, form.confirm);
  const close = () => { setForm(EMPTY); setTouched(false); create.reset(); onClose(); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!problem) create.mutate();
  };
  return (
    <Dialog open={open} title="Tạo tài khoản" onClose={close}>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Email"><input required type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></Field>
        <Field label="Họ tên"><input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputClass} /></Field>
        <Field label="Vai trò">
          <Select ariaLabel="Vai trò" value={form.role} onChange={(v) => setForm({ ...form, role: v })}
            options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))} />
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

export function AccountsPage() {
  const qc = useQueryClient();
  const me = useSession((s) => s.user?.id);
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState<Account | null>(null);
  const { data, error } = useQuery({ queryKey: ["users"], queryFn: () => sendJson<any[]>("/api/v1/admin/users"), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });
  const [pending, setPending] = useState<Pending | null>(null);
  const update = useMutation({
    mutationFn: ({ id, role, is_active }: Pending) => sendJson(`/api/v1/admin/users/${id}`, "PATCH", { role, is_active }),
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
                  <Select ariaLabel={`Vai trò của ${u.email}`} size="sm" className="w-44" disabled={self} value={u.role}
                    onChange={(v) => v !== u.role && setPending({ id: u.id, email: u.email, role: v })}
                    options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))} />
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
      <PasswordDialog account={passwordFor} self={passwordFor?.id === me} onClose={() => setPasswordFor(null)} />
      <ConfirmDialog
        open={!!pending}
        title={pending?.role ? `Đổi vai trò ${pending.email}` : pending?.is_active === false ? `Khoá ${pending?.email}` : `Mở khoá ${pending?.email ?? ""}`}
        confirmLabel={pending?.role ? `Đổi thành ${roleLabel(pending.role)}` : pending?.is_active === false ? "Khoá tài khoản" : "Mở khoá"}
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
