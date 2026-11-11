import { useEffect, useState } from "react";
import { ArrowLeft, ImagePlus, MapPin, Save, TriangleAlert, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { sendJson, uploadImage } from "../api";
import { LoadError } from "../components/LoadError";
import { MapPicker } from "../components/MapPicker";
import { CATEGORIES, categoryLabel } from "../labels";
import { Select } from "../components/Select";

const MAX_IMAGES = 20;
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function coordinate(value: string, limit: number): number | null {
  const text = value.trim();
  if (!DECIMAL.test(text)) return null;
  const n = Number(text);
  return Math.abs(n) <= limit ? n : null;
}

function parsePair(value: string): [lng: string, lat: string] | null {
  const [first, second, ...rest] = value.split(",").map((part) => part.trim());
  if (first === undefined || second === undefined || rest.length) return null;
  if (coordinate(first, 180) !== null && coordinate(second, 90) !== null) return [first, second];
  if (coordinate(first, 90) !== null && coordinate(second, 180) !== null) return [second, first];
  return null;
}

export function PoiFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const { data: existing, error: loadError } = useQuery({
    queryKey: ["poi", id],
    queryFn: () => sendJson<any>(`/api/v1/pois/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
  const [name, setName] = useState("");
  const [category, setCategory] = useState("temple");
  const [priority, setPriority] = useState(1);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [pair, setPair] = useState("");
  const [pairTouched, setPairTouched] = useState(false);
  const [radiusText, setRadiusText] = useState("40");
  const latitude = coordinate(lat, 90);
  const longitude = coordinate(lng, 180);
  const radiusM = Number(radiusText);
  const sliderRadius = radiusText.trim() && Number.isInteger(radiusM) ? Math.min(200, Math.max(10, radiusM)) : 40;
  const invalidPair = Boolean(pair.trim()) && parsePair(pair) === null;
  const [summary, setSummary] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setCategory(existing.category);
    setPriority(existing.priority);
    setLat(String(existing.lat));
    setLng(String(existing.lng));
    setPair("");
    setPairTouched(false);
    setRadiusText(String(existing.radius));
    setSummary(existing.summary ?? "");
    setImages(existing.images);
  }, [existing]);

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    const added: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, MAX_IMAGES - images.length)) {
        added.push(await uploadImage(file));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được ảnh");
    } finally {
      // Giữ lại các ảnh đã tải thành công dù ảnh sau bị lỗi
      setImages((current) => [...current, ...added]);
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Tên không được để trống"); return; }
    if (!Number.isInteger(radiusM) || radiusM < 10 || radiusM > 200) { setError("Bán kính phải là số nguyên từ 10–200 m"); return; }
    if (invalidPair || latitude === null || longitude === null) {
      setError("Nhập tọa độ hợp lệ: vĩ độ từ −90 đến 90, kinh độ từ −180 đến 180.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body = {
        name,
        category,
        priority,
        lat: latitude,
        lng: longitude,
        radius: radiusM,
        summary: summary.trim() || null,
        images,
      };
      if (id) await sendJson(`/api/v1/pois/${id}`, "PATCH", body);
      else await sendJson("/api/v1/pois", "POST", body);
      await queryClient.invalidateQueries({ queryKey: ["pois"] });
      await queryClient.invalidateQueries({ queryKey: ["poi", id] });
      navigate("/pois");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-white border border-slate-200 text-slate-800 text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-slate-400";
  const labelClass = "block text-sm font-medium text-slate-600 mb-1.5";

  if (loadError) return <LoadError error={loadError} />;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate("/pois")}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft size={16} aria-label="Quay lại" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{id ? "Sửa điểm tham quan" : "Thêm điểm tham quan"}</h1>
          <p className="text-slate-500 text-sm">Click bản đồ hoặc kéo marker để chọn toạ độ</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-sm">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            <TriangleAlert size={15} className="inline-flex items-center gap-1.5 shrink-0" aria-hidden /> {error}
          </div>
        )}

        <div>
          <label className={labelClass}>Tên điểm *</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="VD: Chùa Ngọc Hoàng" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Tóm tắt</label>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3}
            maxLength={2000} placeholder="Giới thiệu ngắn về điểm này" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Hình ảnh ({images.length}/{MAX_IMAGES})</label>
          <div className="flex flex-wrap gap-3">
            {images.map((url, i) => (
              <div key={url} className="relative h-24 w-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                <img src={url} alt={`Ảnh ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                <button type="button" aria-label={`Xoá ảnh ${i + 1}`}
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900">
                  <X size={14} aria-hidden />
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <label className={`flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:border-teal-500 hover:text-teal-600 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                <ImagePlus size={20} aria-hidden />
                {uploading ? "Đang tải…" : "Thêm ảnh"}
                <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only"
                  onChange={(e) => { void addImages(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">JPEG, PNG, WebP hoặc GIF, tối đa 8 MB mỗi ảnh. Ảnh được đưa vào pack để app xem khi không có mạng.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Danh mục</label>
            <Select ariaLabel="Danh mục" value={category} onChange={setCategory}
              options={CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))} />
          </div>
          <div>
            <label className={labelClass}>Ưu tiên</label>
            <input type="number" min={1} value={priority} aria-describedby="poi-priority-hint"
              onChange={(e) => setPriority(Number(e.target.value))} className={inputClass} />
            <p id="poi-priority-hint" className="mt-1 text-xs text-slate-500">Khi đứng trong vùng của nhiều điểm, điểm có số lớn hơn được phát trước.</p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <label htmlFor="poi-radius" className="font-medium">Bán kính</label>
            <input id="poi-radius" type="text" inputMode="numeric" value={radiusText}
              onChange={(e) => { if (/^\d*$/.test(e.target.value)) setRadiusText(e.target.value); }}
              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-slate-800" />
            <span>m (10–200 m)</span>
          </div>
          <input type="range" aria-label="Điều chỉnh bán kính" min={10} max={200} value={sliderRadius}
            onChange={(e) => setRadiusText(e.target.value)}
            className="w-full accent-teal-600" />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>10m</span><span>200m</span>
          </div>
        </div>

        <div>
          <label htmlFor="poi-coordinate-pair" className={labelClass}>Dán tọa độ (vd. chép từ Google Maps)</label>
          <input id="poi-coordinate-pair" type="text" value={pair}
            placeholder="VD: 10.7881, 106.6978"
            aria-describedby="poi-coordinate-hint"
            aria-invalid={pairTouched && invalidPair}
            onBlur={() => setPairTouched(true)}
            onChange={(e) => {
              setPair(e.target.value);
              const parsed = parsePair(e.target.value);
              if (parsed) { setLng(parsed[0]); setLat(parsed[1]); }
            }} className={inputClass} />
          <p id="poi-coordinate-hint" className={`mt-1 text-xs ${pairTouched && invalidPair ? "text-red-600" : "text-slate-500"}`}>
            {pairTouched && invalidPair
              ? "Nhập hai tọa độ hợp lệ, ngăn cách bằng dấu phẩy."
              : "Dùng dấu chấm cho phần thập phân. App tự nhận thứ tự ngược khi một số nằm ngoài khoảng vĩ độ."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="poi-lat" className={labelClass}>Vĩ độ (lat)</label>
            <input id="poi-lat" type="text" inputMode="decimal" value={lat}
              onChange={(e) => { setLat(e.target.value); setPair(""); setPairTouched(false); }} className={inputClass} />
          </div>
          <div>
            <label htmlFor="poi-lng" className={labelClass}>Kinh độ (lng)</label>
            <input id="poi-lng" type="text" inputMode="decimal" value={lng}
              onChange={(e) => { setLng(e.target.value); setPair(""); setPairTouched(false); }} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={`${labelClass} inline-flex items-center gap-1.5`}><MapPin size={14} aria-hidden /> Click bản đồ hoặc kéo marker để chọn toạ độ</label>
          <div className="rounded-xl overflow-hidden border border-slate-200">
            <MapPicker lat={latitude} lng={longitude} radius={sliderRadius}
              onChange={(newLat, newLng) => {
                setLat(String(newLat)); setLng(String(newLng)); setPair(""); setPairTouched(false);
              }} />
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button onClick={handleSubmit} disabled={loading || uploading}
            className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm">
            <Save size={15} aria-hidden /> {loading ? "Đang lưu..." : "Lưu điểm"}
          </button>
          <button onClick={() => navigate("/pois")}
            className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors">
            Huỷ
          </button>
        </div>
      </div>
    </div>
  );
}
