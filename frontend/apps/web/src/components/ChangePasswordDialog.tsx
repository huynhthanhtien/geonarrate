import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { sendJson } from "../api";
import { logout } from "../auth/session";
import { Dialog, ErrorBox, Field, ghostBtn, inputClass, primaryBtn } from "./ui";

const MIN_PASSWORD = 8;

/** Người đang đăng nhập tự đổi mật khẩu: cần mật khẩu hiện tại; xong thì phải đăng nhập lại. */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const save = useMutation({
    mutationFn: () => sendJson("/api/v1/auth/change-password", "POST", { current_password: current, new_password: next }),
  });
  const problem =
    next.length < MIN_PASSWORD ? `Mật khẩu mới cần ít nhất ${MIN_PASSWORD} ký tự.`
      : next !== confirm ? "Hai lần nhập mật khẩu mới không khớp."
        : next === current ? "Mật khẩu mới phải khác mật khẩu hiện tại."
          : null;
  const close = () => {
    if (save.isSuccess) return void logout(); // phiên đã bị thu hồi ở máy chủ
    setCurrent(""); setNext(""); setConfirm(""); setTouched(false); save.reset(); onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!problem) save.mutate();
  };
  return (
    <Dialog open={open} title="Đổi mật khẩu" onClose={close}>
      {save.isSuccess ? (
        <>
          <p role="status">Đã đổi mật khẩu. Mọi phiên đăng nhập, kể cả phiên này, đã kết thúc; hãy đăng nhập lại bằng mật khẩu mới.</p>
          <div className="mt-5 flex justify-end"><button type="button" className={primaryBtn} onClick={close}>Đăng nhập lại</button></div>
        </>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <Field label="Mật khẩu hiện tại"><input required type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} /></Field>
          <Field label={`Mật khẩu mới (tối thiểu ${MIN_PASSWORD} ký tự)`}><input required type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} /></Field>
          <Field label="Nhập lại mật khẩu mới"><input required type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} /></Field>
          {touched && problem && <p className="text-sm text-red-600" role="alert">{problem}</p>}
          <ErrorBox error={save.error} />
          <p className="text-xs text-slate-500">Sau khi đổi, bạn sẽ bị đăng xuất khỏi mọi thiết bị.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={ghostBtn} onClick={close}>Huỷ</button>
            <button className={primaryBtn} disabled={save.isPending}><KeyRound size={15} aria-hidden /> {save.isPending ? "Đang lưu…" : "Đổi mật khẩu"}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
