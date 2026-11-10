import { Check, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

export type PickItem = { id: string; label: string; meta?: ReactNode; hidden?: boolean };

/**
 * Chọn nhiều mục từ danh sách dài: ô tìm, khung cuộn chiều cao cố định, mục đã chọn hiện thành thẻ.
 * `hidden` đánh dấu mục ẩn mặc định (vd. tour miễn phí); `revealLabel` là nhãn công tắc hiện chúng.
 */
export function MultiPicker({
  items, value, onChange, placeholder = "Tìm…", revealLabel, emptyText = "Không có mục nào.",
}: {
  items: PickItem[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  revealLabel?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [reveal, setReveal] = useState(false);
  const hiddenCount = items.filter((i) => i.hidden).length;
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return items.filter((i) => (reveal || !i.hidden || value.includes(i.id)) && (!q || i.label.toLocaleLowerCase().includes(q)));
  }, [items, query, reveal, value]);
  const selected = items.filter((i) => value.includes(i.id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const unselectedShown = shown.filter((i) => !value.includes(i.id));

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 p-2">
          {selected.map((i) => (
            <span key={i.id} className="inline-flex items-center gap-1 rounded-md bg-teal-50 py-0.5 pl-2 pr-1 text-xs font-medium text-teal-800">
              {i.label}
              <button type="button" aria-label={`Bỏ ${i.label}`} onClick={() => toggle(i.id)} className="rounded p-0.5 hover:bg-teal-100"><X size={12} aria-hidden /></button>
            </span>
          ))}
          <button type="button" onClick={() => onChange([])} className="ml-auto px-1 text-xs text-slate-500 hover:text-slate-700 hover:underline">Bỏ chọn ({selected.length})</button>
        </div>
      )}
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <Search size={14} className="text-slate-400" aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
        {unselectedShown.length > 1 && (
          <button type="button" onClick={() => onChange([...value, ...unselectedShown.map((i) => i.id)])}
            className="shrink-0 text-xs font-medium text-teal-700 hover:underline">
            Chọn tất cả {query.trim() ? `${unselectedShown.length} kết quả` : `(${unselectedShown.length})`}
          </button>
        )}
      </div>
      <ul className="max-h-52 overflow-y-auto py-1" role="listbox" aria-multiselectable>
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">{query ? "Không có kết quả." : emptyText}</li>}
        {shown.map((i) => {
          const on = value.includes(i.id);
          return (
            <li key={i.id} role="option" aria-selected={on}>
              <button type="button" onClick={() => toggle(i.id)} className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${on ? "text-teal-800" : "text-slate-700"}`}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300"}`}>{on && <Check size={11} aria-hidden />}</span>
                <span className="min-w-0 flex-1 truncate">{i.label}</span>
                {i.meta}
              </button>
            </li>
          );
        })}
      </ul>
      {revealLabel && hiddenCount > 0 && (
        <label className="flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
          {revealLabel} ({hiddenCount})
        </label>
      )}
    </div>
  );
}
