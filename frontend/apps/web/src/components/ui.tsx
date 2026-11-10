import type { ReactNode } from "react";

export const inputClass =
  "w-full bg-white border border-slate-200 text-slate-800 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500";
export const primaryBtn =
  "inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors";
export const ghostBtn =
  "inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors";
export const dangerBtn =
  "inline-flex items-center gap-1.5 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50 text-red-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors";

export function Page({ title, subtitle, action, children }: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
          {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const text = error instanceof Error ? error.message : String(error);
  return (
    <p role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
      {text}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
      {children}
    </p>
  );
}

const TONES = {
  gray: "bg-slate-100 text-slate-600",
  amber: "bg-amber-100 text-amber-700",
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  blue: "bg-sky-100 text-sky-700",
} as const;

export function Badge({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-50 text-slate-500">
          <tr>{head.map((h) => <th key={h} className="px-4 py-2.5 font-medium whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">{children}</tbody>
      </table>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-600">
      <span className="block mb-1">{label}</span>
      {children}
    </label>
  );
}
