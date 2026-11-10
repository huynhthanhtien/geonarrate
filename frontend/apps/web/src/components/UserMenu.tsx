import { ChevronDown, KeyRound, LogOut, MonitorOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { logout, useSession } from "../auth/session";
import { roleLabel } from "../labels";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { ConfirmDialog } from "./ui";

const initials = (name: string) =>
  name.split(/[\s@.]+/).filter(Boolean).slice(-2).map((w) => w[0]!.toLocaleUpperCase()).join("") || "?";

/** Menu tài khoản ở góc phải: tên, vai trò, đổi mật khẩu, đăng xuất. */
export function UserMenu() {
  const user = useSession((s) => s.user);
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [allError, setAllError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function logoutAll() {
    setBusy(true);
    setAllError(null);
    const { response } = await api.POST("/api/v1/auth/logout-all").catch(() => ({ response: null }));
    setBusy(false);
    // Chưa thu hồi được thì giữ phiên và báo lỗi, tránh tưởng các thiết bị khác đã bị đăng xuất
    if (!response?.ok) return setAllError("Không đăng xuất được các thiết bị khác, hãy thử lại sau.");
    await logout();
  }

  const name = user?.full_name || user?.email || "";
  const item = "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white" aria-hidden>{initials(name)}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium text-slate-800">{name}</span>
          <span className="block text-xs text-slate-500">{user?.roles?.map(roleLabel).join(", ") ?? ""}</span>
        </span>
        <ChevronDown size={15} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <div className="border-b border-slate-100 px-3 pb-2 pt-1.5">
            <p className="truncate text-sm font-medium text-slate-800">{name}</p>
            {user?.full_name && <p className="truncate text-xs text-slate-500">{user.email}</p>}
          </div>
          <div className="pt-1">
            <button role="menuitem" className={item} onClick={() => { setOpen(false); setChanging(true); }}>
              <KeyRound size={15} className="text-slate-400" aria-hidden /> Đổi mật khẩu
            </button>
            <button role="menuitem" className={item} onClick={() => { setOpen(false); void logout(); }}>
              <LogOut size={15} className="text-slate-400" aria-hidden /> Đăng xuất
            </button>
            <button role="menuitem" className={`${item} text-red-700 hover:bg-red-50`} onClick={() => { setOpen(false); setConfirmAll(true); }}>
              <MonitorOff size={15} aria-hidden /> Đăng xuất mọi nơi
            </button>
          </div>
        </div>
      )}
      <ChangePasswordDialog open={changing} onClose={() => setChanging(false)} />
      <ConfirmDialog
        open={confirmAll}
        title="Đăng xuất khỏi mọi thiết bị?"
        confirmLabel={busy ? "Đang đăng xuất…" : "Đăng xuất mọi nơi"}
        danger
        busy={busy}
        onConfirm={() => void logoutAll()}
        onClose={() => { setConfirmAll(false); setAllError(null); }}
      >
        <p>Mọi phiên đăng nhập của bạn trên các máy khác và máy này sẽ kết thúc ngay.</p>
        {allError && <p className="mt-2 text-red-700" role="alert">{allError}</p>}
      </ConfirmDialog>
    </div>
  );
}
