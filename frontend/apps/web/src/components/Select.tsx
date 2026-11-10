import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string; hint?: string };

/**
 * Ô chọn thay cho <select> gốc (danh sách gốc do trình duyệt vẽ, không chỉnh giao diện được).
 * Danh sách render qua portal nên không bị khung bảng cắt; nằm trong <dialog> thì portal vào dialog.
 */
export function Select({
  value, onChange, options, placeholder = "Chọn…", ariaLabel, disabled, required, icon, className = "", size = "md",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  required?: boolean;
  icon?: ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const searchable = options.length > 8;
  const shown = useMemo(
    () => (query.trim() ? options.filter((o) => o.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : options),
    [options, query],
  );
  const selected = options.find((o) => o.value === value);

  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 260 && r.top > below;
    setPos({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: r.width, up });
  };
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => { window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openList = () => {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (o: SelectOption | undefined) => {
    if (!o) return;
    onChange(o.value);
    setOpen(false);
    button.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === "ArrowDown") setActive((a) => Math.min(shown.length - 1, a + 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(shown.length - 1);
    else if (e.key === "Enter") pick(shown[active]);
    else if (e.key === "Escape" || e.key === "Tab") { setOpen(false); if (e.key === "Escape") button.current?.focus(); return; }
    else if (!searchable && e.key.length === 1) {
      // Gõ chữ để nhảy tới mục bắt đầu bằng chữ đó
      const i = shown.findIndex((o) => o.label.toLocaleLowerCase().startsWith(e.key.toLocaleLowerCase()));
      if (i >= 0) setActive(i);
      return;
    } else return;
    e.preventDefault();
  };

  const pad = size === "sm" ? "py-1 text-sm" : "py-2 text-sm";
  const host = button.current?.closest("dialog") ?? document.body;
  return (
    <div className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
        className={`flex w-full items-center gap-2 rounded-lg border bg-white px-3 ${pad} text-left text-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${open ? "border-teal-500" : "border-slate-200 hover:border-slate-300"}`}
      >
        {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-slate-400"}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {required && (
        // Giữ kiểm tra "bắt buộc" của form như <select required>
        <input tabIndex={-1} aria-hidden required value={value} onChange={() => undefined}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0" onFocus={() => button.current?.focus()} />
      )}
      {open && pos && createPortal(
        <div
          ref={list}
          className="fixed z-50 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          style={{ left: pos.left, width: Math.max(pos.width, 200), ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <Search size={14} className="text-slate-400" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onKey}
                placeholder="Tìm…"
                aria-label="Tìm trong danh sách"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          )}
          <div id={`${id}-list`} role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-y-auto py-1">
            {shown.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">Không có kết quả</p>}
            {shown.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <div
                  key={o.value}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${i === active ? "bg-teal-50" : ""} ${isSelected ? "font-medium text-teal-800" : "text-slate-700"}`}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-xs text-slate-400">{o.hint}</span>}
                  <Check size={14} className={`shrink-0 ${isSelected ? "text-teal-600" : "invisible"}`} aria-hidden />
                </div>
              );
            })}
          </div>
        </div>,
        host,
      )}
    </div>
  );
}
