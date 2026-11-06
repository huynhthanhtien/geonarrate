import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { useState } from "react";
import { sendJson } from "../api";
import { Badge, Empty, ErrorBox, Field, ghostBtn, inputClass, Page, primaryBtn, Table } from "../components/ui";

interface Form {
  id?: string;
  slug: string;
  name: string;
  access: string;
  status: string;
  points: Record<string, boolean>; // id điểm -> nghe thử
}
const EMPTY: Form = { slug: "", name: "", access: "free", status: "draft", points: {} };

export function ToursPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const tours = useQuery({ queryKey: ["tours"], queryFn: () => sendJson<any[]>("/api/v1/tours"), retry: false });
  const points = useQuery({ queryKey: ["attractions", "", ""], queryFn: () => sendJson<any[]>("/api/v1/attractions?"), retry: false });
  const open = useMutation({
    mutationFn: (id: string) => sendJson<any>(`/api/v1/tours/${id}`),
    onSuccess: (t) =>
      setForm({
        id: t.id,
        slug: t.slug,
        name: t.name,
        access: t.access,
        status: t.status,
        points: Object.fromEntries(t.attractions.map((p: any) => [p.id, p.is_preview])),
      }),
  });
  const save = useMutation({
    mutationFn: (f: Form) => {
      const body = {
        slug: f.slug,
        name: f.name,
        access: f.access,
        status: f.status,
        attractions: Object.entries(f.points).map(([id, is_preview]) => ({ id, is_preview })),
      };
      return f.id ? sendJson(`/api/v1/tours/${f.id}`, "PATCH", body) : sendJson("/api/v1/tours", "POST", body);
    },
    onSuccess: () => { setForm(null); return qc.invalidateQueries({ queryKey: ["tours"] }); },
  });
  return (
    <Page
      title="Tour"
      subtitle="Gom điểm thành tour, đặt miễn phí hoặc trả phí và chọn điểm nghe thử"
      action={<button className={primaryBtn} onClick={() => setForm(EMPTY)}><Plus size={15} aria-hidden /> Thêm tour</button>}
    >
      <ErrorBox error={tours.error ?? open.error ?? save.error} />
      {form && (
        <form className="bg-white border border-slate-200 rounded-xl p-5 mb-5 space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
          <div className="grid md:grid-cols-4 gap-3">
            <Field label="Tên"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
            <Field label="Slug"><input required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="vd: dai-hoc-sai-gon" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={inputClass} /></Field>
            <Field label="Truy cập">
              <select value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value })} className={inputClass}>
                <option value="free">Miễn phí</option>
                <option value="paid">Trả phí (cần vé)</option>
              </select>
            </Field>
            <Field label="Trạng thái">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                <option value="draft">Nháp</option>
                <option value="published">Hiện trên app</option>
              </select>
            </Field>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600 mb-2">Điểm trong tour</p>
            <div className="grid md:grid-cols-2 gap-1.5">
              {points.data?.map((p) => {
                const on = p.id in form.points;
                return (
                  <div key={p.id} className="flex items-center gap-3 text-sm text-slate-700">
                    <label className="flex items-center gap-2 flex-1">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const next = { ...form.points };
                          if (e.target.checked) next[p.id] = false;
                          else delete next[p.id];
                          setForm({ ...form, points: next });
                        }}
                      />
                      {p.name}
                    </label>
                    {on && form.access === "paid" && (
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        <input type="checkbox" checked={form.points[p.id]} onChange={(e) => setForm({ ...form, points: { ...form.points, [p.id]: e.target.checked } })} /> Nghe thử
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button className={primaryBtn} disabled={save.isPending || !Object.keys(form.points).length}><Save size={15} aria-hidden /> Lưu tour</button>
            <button type="button" className={ghostBtn} onClick={() => setForm(null)}>Huỷ</button>
          </div>
        </form>
      )}
      {tours.data?.length === 0 && !form && <Empty>Chưa có tour nào.</Empty>}
      {!!tours.data?.length && (
        <Table head={["Tên", "Slug", "Điểm", "Truy cập", "Trạng thái", ""]}>
          {tours.data.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2.5 font-medium">{t.name}</td>
              <td className="px-4 py-2.5 text-slate-500">{t.slug}</td>
              <td className="px-4 py-2.5">{t.attraction_count}</td>
              <td className="px-4 py-2.5"><Badge tone={t.access === "paid" ? "amber" : "green"}>{t.access === "paid" ? "Trả phí" : "Miễn phí"}</Badge></td>
              <td className="px-4 py-2.5"><Badge tone={t.status === "published" ? "green" : "gray"}>{t.status === "published" ? "Hiện trên app" : "Nháp"}</Badge></td>
              <td className="px-4 py-2.5 text-right"><button className={ghostBtn} onClick={() => open.mutate(t.id)}>Sửa</button></td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
