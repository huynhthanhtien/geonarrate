import { useState } from "react";
import { useNavigate } from "react-router";
import { MapPicker } from "../components/MapPicker";

const CATEGORIES = ["temple", "church", "museum", "park", "other"];

export function AttractionFormPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("temple");
  const [priority, setPriority] = useState(1);
  const [lat, setLat] = useState(10.7881);
  const [lng, setLng] = useState(106.6978);
  const [radiusM, setRadiusM] = useState(40);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Tên không được để trống"); return; }
    if (radiusM < 10 || radiusM > 200) { setError("Bán kính phải từ 10–200m"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/attractions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, priority, lat, lng, radius: radiusM }),
      });
      if (!res.ok) { setError((await res.json()).detail ?? "Có lỗi xảy ra"); return; }
      navigate("/attractions");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-white border border-slate-200 text-slate-800 text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-slate-400";
  const labelClass = "block text-sm font-medium text-slate-600 mb-1.5";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate("/attractions")}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors">
          ←
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Thêm điểm tham quan</h1>
          <p className="text-slate-500 text-sm">Click bản đồ hoặc kéo marker để chọn toạ độ</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-sm">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            ⚠️ {error}
          </div>
        )}

        <div>
          <label className={labelClass}>Tên điểm *</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="VD: Chùa Ngọc Hoàng" className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Danh mục</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Ưu tiên</label>
            <input type="number" min={1} value={priority}
              onChange={(e) => setPriority(Number(e.target.value))} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>
            Bán kính: <span className="text-teal-600 font-bold">{radiusM}m</span>
            <span className="text-slate-400 font-normal"> (10–200m)</span>
          </label>
          <input type="range" min={10} max={200} value={radiusM}
            onChange={(e) => setRadiusM(Number(e.target.value))}
            className="w-full accent-teal-600" />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>10m</span><span>200m</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Vĩ độ (lat)</label>
            <input type="number" step="0.0001" value={lat}
              onChange={(e) => setLat(Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Kinh độ (lng)</label>
            <input type="number" step="0.0001" value={lng}
              onChange={(e) => setLng(Number(e.target.value))} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>📍 Click bản đồ hoặc kéo marker để chọn toạ độ</label>
          <div className="rounded-xl overflow-hidden border border-slate-200">
            <MapPicker lat={lat} lng={lng} radius={radiusM}
              onChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }} />
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button onClick={handleSubmit} disabled={loading}
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm">
            {loading ? "Đang lưu..." : "💾 Lưu điểm"}
          </button>
          <button onClick={() => navigate("/attractions")}
            className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors">
            Huỷ
          </button>
        </div>
      </div>
    </div>
  );
}