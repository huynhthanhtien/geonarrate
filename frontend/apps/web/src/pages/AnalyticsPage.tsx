import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { sendJson } from "../api";
import { Empty, ErrorBox, Field, inputClass, Page, Table } from "../components/ui";
import { useLanguages } from "../languages";

const dateStr = (d: Date) => d.toISOString().slice(0, 10);

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
  });
  if (tour) params.set("tour_id", tour);
  if (lang) params.set("lang", lang);
  const { data, error } = useQuery({
    queryKey: ["analytics", params.toString()],
    queryFn: () => sendJson<any>(`/api/v1/analytics/summary?${params}`),
    retry: false,
  });
  const stats = [
    ["Lượt nghe", data?.plays ?? 0],
    ["Nghe hết", data?.completes ?? 0],
    ["Tỉ lệ nghe hết", data?.completion_rate != null ? `${Math.round(data.completion_rate * 100)}%` : "-"],
  ];
  return (
    <Page title="Analytics" subtitle="Số liệu nghe do ứng dụng gửi về">
      <div className="grid md:grid-cols-4 gap-3 mb-5">
        <Field label="Từ ngày"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} /></Field>
        <Field label="Đến ngày"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} /></Field>
        <Field label="Tour">
          <select value={tour} onChange={(e) => setTour(e.target.value)} className={inputClass}>
            <option value="">Mọi tour</option>
            {tours.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Ngôn ngữ">
          <select value={lang} onChange={(e) => setLang(e.target.value)} className={inputClass}>
            <option value="">Mọi ngôn ngữ</option>
            {languages.data?.map((l) => <option key={l.code} value={l.code}>{l.native_name} ({l.code})</option>)}
          </select>
        </Field>
      </div>
      <ErrorBox error={languages.error ?? error} />
      <div className="grid grid-cols-3 gap-4 mb-5">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-3xl font-bold text-slate-800">{value}</p>
            <p className="text-sm text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>
      {data?.plays === 0 && <Empty>Chưa có dữ liệu trong khoảng đã chọn.</Empty>}
      {!!data?.top_pois?.length && (
        <Table head={["Điểm được nghe nhiều nhất", "Lượt nghe"]}>
          {data.top_pois.map((a: any) => (
            <tr key={a.id}><td className="px-4 py-2.5">{a.name}</td><td className="px-4 py-2.5">{a.plays}</td></tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
