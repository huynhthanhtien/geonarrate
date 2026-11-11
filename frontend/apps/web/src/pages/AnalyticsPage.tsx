import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { sendJson } from "../api";
import { CHART, LineLegend, RankedBars, TrendChart } from "../components/charts";
import { Empty, ErrorBox, Field, inputClass, Page, Table } from "../components/ui";
import { useLanguages } from "../languages";
import { Select } from "../components/Select";

type Summary = {
  plays: number;
  completes: number;
  devices: number;
  by_trigger: { trigger: string; plays: number }[];
  by_hour: { hour: number; plays: number }[];
  completion_rate: number | null;
  top_pois: { id: string; name: string; plays: number; completes: number }[];
  by_lang: { lang: string; plays: number }[];
  by_day: { day: string; plays: number; completes: number }[];
};

const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Mọi ngày trong khoảng chọn (ngày không có lượt nghe là 0), để trục thời gian liên tục. */
function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (cursor <= stop && out.length < 400) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function AnalyticsPage() {
  const languages = useLanguages();
  const [start, setStart] = useState(dateStr(new Date(Date.now() - 30 * 86400000)));
  const [end, setEnd] = useState(dateStr(new Date()));
  const [tour, setTour] = useState("");
  const [lang, setLang] = useState("");
  const tours = useQuery({ queryKey: ["tours"], queryFn: () => sendJson<any[]>("/api/v1/tours"), retry: false });
  const params = new URLSearchParams({
    start: new Date(`${start}T00:00:00`).toISOString(),
    end: new Date(`${end}T23:59:59`).toISOString(),
    tz: timeZone,
  });
  if (tour) params.set("tour_id", tour);
  if (lang) params.set("lang", lang);
  const { data, error } = useQuery({
    queryKey: ["analytics", params.toString()],
    queryFn: () => sendJson<Summary>(`/api/v1/analytics/summary?${params}`),
    retry: false,
  });
  const stats = [
    ["Lượt nghe", data?.plays ?? 0],
    ["Nghe hết", data?.completes ?? 0],
    ["Thiết bị", data?.devices ?? 0],
    ["Tỉ lệ nghe hết (ước tính)", data?.completion_rate != null ? `${Math.round(data.completion_rate * 100)}%` : "-"],
  ];
  const days = daysBetween(start, end);
  const byDay = new Map(data?.by_day.map((d) => [d.day, d]) ?? []);
  const trend = [
    { name: "Lượt nghe", values: days.map((d) => byDay.get(d)?.plays ?? 0) },
    { name: "Nghe hết", values: days.map((d) => byDay.get(d)?.completes ?? 0) },
  ];
  const langName = (code: string) => languages.data?.find((l) => l.code === code)?.native_name ?? code;
  const langRows = [...(data?.by_lang ?? [])]
    .sort((a, b) => b.plays - a.plays)
    .map((l) => ({ key: l.lang, label: `${langName(l.lang)} (${l.lang})`, value: l.plays }));
  const triggerNames: Record<string, string> = { manual: "Thủ công", geofence: "Tự động theo vị trí", unknown: "Không xác định" };
  const triggerRows = (data?.by_trigger ?? []).map((item) => ({ key: item.trigger, label: triggerNames[item.trigger] ?? item.trigger, value: item.plays }));
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const hourCounts = new Map(data?.by_hour.map((item) => [item.hour, item.plays]) ?? []);

  return (
    <Page title="Analytics" subtitle="Số liệu nghe do ứng dụng gửi về">
      <div className="grid md:grid-cols-4 gap-3 mb-5">
        <Field label="Từ ngày"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} /></Field>
        <Field label="Đến ngày"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} /></Field>
        <Field label="Tour">
          <Select ariaLabel="Tour" value={tour} onChange={setTour}
            options={[{ value: "", label: "Mọi tour" }, ...(tours.data ?? []).map((t) => ({ value: t.id, label: t.name }))]} />
        </Field>
        <Field label="Ngôn ngữ">
          <Select ariaLabel="Ngôn ngữ" value={lang} onChange={setLang}
            options={[{ value: "", label: "Mọi ngôn ngữ" }, ...(languages.data ?? []).map((l) => ({ value: l.code, label: `${l.native_name} (${l.code})` }))]} />
        </Field>
      </div>
      <ErrorBox error={languages.error ?? error} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-3xl font-bold text-slate-800">{value}</p>
            <p className="text-sm text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>
      <p className="mb-5 text-sm text-slate-500">Thiết bị không đồng nghĩa với người nghe. Tỉ lệ nghe hết là ước tính từ số sự kiện, chưa ghép theo từng lượt nghe.</p>
      {tour && <p className="mb-5 text-sm text-slate-500">Lọc tour dựa trên các điểm hiện thuộc tour; một điểm có thể thuộc nhiều tour.</p>}
      {data?.plays === 0 && <Empty>Chưa có dữ liệu trong khoảng đã chọn.</Empty>}
      {!!data?.plays && (
        <div className="space-y-5">
          <Card title="Lượt nghe theo ngày" subtitle={`Theo múi giờ ${timeZone}`}>
            <div className="mb-3"><LineLegend names={trend.map((s) => s.name)} /></div>
            <TrendChart labels={days.map(shortDay)} series={trend} />
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Xem dạng bảng</summary>
              <div className="mt-3">
                <Table head={["Ngày", "Lượt nghe", "Nghe hết"]}>
                  {days.filter((d) => byDay.has(d)).map((d) => (
                    <tr key={d}>
                      <td className="px-4 py-2">{shortDay(d)}/{d.slice(0, 4)}</td>
                      <td className="px-4 py-2 tabular-nums">{byDay.get(d)!.plays}</td>
                      <td className="px-4 py-2 tabular-nums">{byDay.get(d)!.completes}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            </details>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Cách bắt đầu phát" subtitle="Số lượt phát theo cách kích hoạt">
              <RankedBars rows={triggerRows} total={data.plays} />
            </Card>
            <Card title="Lượt nghe theo giờ" subtitle={`Theo múi giờ ${timeZone}`}>
              <TrendChart labels={hours.map((hour) => `${String(hour).padStart(2, "0")}h`)} series={[{ name: "Lượt nghe", values: hours.map((hour) => hourCounts.get(hour) ?? 0) }]} height={200} />
            </Card>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Điểm được nghe nhiều nhất" subtitle="Số sự kiện trong khoảng chọn, tối đa 10 điểm">
              <div className="mb-3"><LineLegend names={["Lượt nghe", "Nghe hết"]} /></div>
              <ul className="space-y-3">
                {data.top_pois.map((point) => {
                  const max = Math.max(1, ...data.top_pois.flatMap((p) => [p.plays, p.completes]));
                  return (
                    <li key={point.id} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 px-1" aria-label={`${point.name}: ${point.plays} lượt nghe, ${point.completes} sự kiện nghe hết`}>
                      <span className="truncate text-sm text-slate-700" title={point.name}>{point.name}</span>
                      <div className="space-y-1">
                        {[point.plays, point.completes].map((value, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <span className="h-2.5 rounded-r" style={{ width: `${(value / max) * 85}%`, background: CHART.series[index] }} />
                            <span className="text-xs font-semibold tabular-nums text-slate-900">{value}</span>
                          </div>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card title="Lượt nghe theo ngôn ngữ">
              <RankedBars rows={langRows} total={data.plays} />
            </Card>
          </div>
          <Card title="Chi tiết theo điểm" subtitle="Tối đa 10 điểm có lượt nghe cao nhất; số nghe hết được đếm riêng trong khoảng chọn">
            <Table head={["Điểm tham quan", "Lượt nghe", "Sự kiện nghe hết"]}>
              {data.top_pois.map((point) => <tr key={point.id}><td className="px-4 py-2">{point.name}</td><td className="px-4 py-2 tabular-nums">{point.plays}</td><td className="px-4 py-2 tabular-nums">{point.completes}</td></tr>)}
            </Table>
          </Card>
        </div>
      )}
    </Page>
  );
}
