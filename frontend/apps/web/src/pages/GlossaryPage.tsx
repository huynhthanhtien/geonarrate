import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { sendJson } from "../api";
import { Badge, dangerBtn, Empty, ErrorBox, Field, inputClass, LANGS, Page, primaryBtn, Table } from "../components/ui";

export function GlossaryPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ term: "", target_lang: "en", translation: "", is_required: true, attraction_id: "" });
  const { data, error } = useQuery({
    queryKey: ["glossaries"],
    queryFn: () => sendJson<any[]>("/api/v1/glossaries"),
    retry: false,
  });
  const points = useQuery({ queryKey: ["attractions", "", ""], queryFn: () => sendJson<any[]>("/api/v1/attractions?"), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ["glossaries"] });
  const add = useMutation({
    mutationFn: () => sendJson("/api/v1/glossaries", "POST", { ...form, attraction_id: form.attraction_id || null }),
    onSuccess: () => { setForm({ ...form, term: "", translation: "" }); return refresh(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => sendJson(`/api/v1/glossaries/${id}`, "DELETE"),
    onSuccess: refresh,
  });
  const name = (id: string | null) => (id ? points.data?.find((p) => p.id === id)?.name ?? id : "Toàn hệ thống");
  return (
    <Page title="Thuật ngữ" subtitle="Cố định cách dịch tên riêng để máy không dịch mỗi lần một kiểu">
      <form
        className="bg-white border border-slate-200 rounded-xl p-5 mb-5 grid md:grid-cols-5 gap-3 items-end"
        onSubmit={(e) => { e.preventDefault(); add.mutate(); }}
      >
        <Field label="Từ gốc"><input required value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} className={inputClass} /></Field>
        <Field label="Ngôn ngữ">
          <select value={form.target_lang} onChange={(e) => setForm({ ...form, target_lang: e.target.value })} className={inputClass}>
            {LANGS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Cách dịch"><input required value={form.translation} onChange={(e) => setForm({ ...form, translation: e.target.value })} className={inputClass} /></Field>
        <Field label="Áp dụng cho">
          <select value={form.attraction_id} onChange={(e) => setForm({ ...form, attraction_id: e.target.value })} className={inputClass}>
            <option value="">Toàn hệ thống</option>
            {points.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600 flex items-center gap-1.5">
            <input type="checkbox" checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} /> Bắt buộc
          </label>
          <button className={primaryBtn} disabled={add.isPending}><Plus size={15} aria-hidden /> Thêm</button>
        </div>
      </form>
      <ErrorBox error={error ?? add.error ?? remove.error} />
      {data?.length === 0 && <Empty>Chưa có thuật ngữ nào.</Empty>}
      {!!data?.length && (
        <Table head={["Từ gốc", "Ngôn ngữ", "Cách dịch", "Áp dụng", "Mức", ""]}>
          {data.map((g) => (
            <tr key={g.id}>
              <td className="px-4 py-2.5 font-medium">{g.term}</td>
              <td className="px-4 py-2.5">{g.target_lang}</td>
              <td className="px-4 py-2.5">{g.translation}</td>
              <td className="px-4 py-2.5">{name(g.attraction_id)}</td>
              <td className="px-4 py-2.5"><Badge tone={g.is_required ? "amber" : "gray"}>{g.is_required ? "Bắt buộc" : "Gợi ý"}</Badge></td>
              <td className="px-4 py-2.5 text-right">
                <button className={dangerBtn} onClick={() => remove.mutate(g.id)} aria-label={`Xoá ${g.term}`}><Trash2 size={14} aria-hidden /></button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
