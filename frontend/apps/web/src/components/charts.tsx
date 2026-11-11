import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/** Màu và nét theo quy ước biểu đồ chung; chữ luôn dùng màu chữ, không dùng màu series. */
export const CHART = {
  series: ["#2a78d6", "#eb6834"],
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
  ink: "#0b0b0b",
  ink2: "#52514e",
  surface: "#ffffff",
};

const fmt = new Intl.NumberFormat("vi-VN");

/** Mốc trục y tròn số: 0, bước 1/2/5 × 10^n, tối đa ~4 vạch. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export type Series = { name: string; values: number[] };

/** Biểu đồ đường theo ngày: một trục y, đường 2px, crosshair + tooltip liệt kê mọi series. */
export function TrendChart({ labels, series, height = 240 }: { labels: string[]; series: Series[]; height?: number }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const pad = { top: 12, right: 16, bottom: 28, left: 44 };
  const w = Math.max(width - pad.left - pad.right, 1);
  const h = height - pad.top - pad.bottom;
  const ticks = niceTicks(Math.max(0, ...series.flatMap((s) => s.values)));
  const top = ticks[ticks.length - 1]!;
  const n = labels.length;
  const x = (i: number) => pad.left + (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v: number) => pad.top + h - (v / top) * h;
  const path = (values: number[]) => values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  // Nhãn trục x thưa: tối đa ~6 mốc, luôn có mốc đầu và cuối
  const every = Math.max(1, Math.ceil(n / 6));
  const xTicks = labels.map((_, i) => i).filter((i) => i % every === 0 || i === n - 1);
  const last = n - 1;
  const ends = series.map((s) => y(s.values[last] ?? 0));
  const endLabels = ends.length < 2 || Math.abs(ends[0]! - ends[1]!) >= 16;

  const pick = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / Math.max(rect.width, 1);
    setActive(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))));
  };
  const keys = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowRight") setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? n) - 1));
    else return;
    e.preventDefault();
  };

  return (
    <div ref={box} className="relative">
      {width > 0 && (
        <svg width={width} height={height} role="img" tabIndex={0} onKeyDown={keys} onBlur={() => setActive(null)}
          aria-label={`Biểu đồ đường: ${series.map((s) => s.name).join(", ")} theo ngày`}
          className="block outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={pad.left + w} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.axis : CHART.grid} />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={CHART.muted}
                style={{ fontVariantNumeric: "tabular-nums" }}>{fmt.format(t)}</text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
              fontSize={11} fill={CHART.muted}>{labels[i]}</text>
          ))}
          {active !== null && <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + h} stroke={CHART.axis} />}
          {series.map((s, k) => (
            <path key={s.name} d={path(s.values)} fill="none" stroke={CHART.series[k]} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {series.map((s, k) => {
            const i = active ?? last;
            return <circle key={s.name} cx={x(i)} cy={y(s.values[i] ?? 0)} r={4} fill={CHART.series[k]}
              stroke={CHART.surface} strokeWidth={2} />;
          })}
          {active === null && endLabels && series.map((s, k) => (
            <text key={s.name} x={x(last) - 8} y={ends[k]! - 10} textAnchor="end" fontSize={12} fontWeight={600}
              fill={CHART.ink}>{fmt.format(s.values[last] ?? 0)}</text>
          ))}
          <rect x={pad.left} y={pad.top} width={w} height={h} fill="transparent"
            onPointerMove={pick} onPointerLeave={() => setActive(null)} />
        </svg>
      )}
      {active !== null && (
        <div role="status" className="pointer-events-none absolute top-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: Math.min(Math.max(x(active) - 70, 0), Math.max(width - 140, 0)) }}>
          <p className="mb-1 text-slate-500">{labels[active]}</p>
          {series.map((s, k) => (
            <p key={s.name} className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: CHART.series[k] }} />
              <strong className="text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt.format(s.values[active] ?? 0)}</strong>
              <span className="text-slate-500">{s.name}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Chú giải cho từ hai series: khoá dạng nét vì biểu đồ là đường. */
export function LineLegend({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-600">
      {names.map((name, k) => (
        <span key={name} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: CHART.series[k] }} />{name}
        </span>
      ))}
    </div>
  );
}

/** Cột ngang xếp hạng, một màu: giá trị ở đầu cột, tooltip thêm tỉ trọng. */
export function RankedBars({ rows, total }: { rows: { key: string; label: string; value: number }[]; total: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1">
      {rows.map((r) => {
        const share = total ? Math.round((r.value / total) * 100) : 0;
        return (
          <li key={r.key} tabIndex={0} onPointerEnter={() => setHover(r.key)} onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(r.key)} onBlur={() => setHover(null)}
            aria-label={`${r.label}: ${fmt.format(r.value)} lượt nghe, ${share}%`}
            className="relative grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 rounded-md px-1 py-1.5 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-600">
            <span className="truncate text-sm text-slate-700" title={r.label}>{r.label}</span>
            <span className="flex items-center gap-2">
              <span className="h-3 rounded-r" style={{
                width: `${Math.max((r.value / max) * 85, 0.5)}%`, background: CHART.series[0],
                opacity: hover && hover !== r.key ? 0.55 : 1,
              }} />
              <span className="text-sm font-semibold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt.format(r.value)}</span>
            </span>
            {hover === r.key && (
              <span role="status" className="pointer-events-none absolute -top-8 right-2 z-10 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs shadow-md">
                <strong className="text-slate-900">{fmt.format(r.value)}</strong>{" "}
                <span className="text-slate-500">lượt · {share}% tổng</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
