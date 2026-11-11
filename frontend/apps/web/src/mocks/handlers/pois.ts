import { http, HttpResponse } from "msw";
import { findAll, findById, create, update, remove } from "../db";
import contract from "../../../../../../backend/openapi.json";

const SCRIPT_MAX_CHARS = contract.components.schemas.ScriptIn.properties.script.maxLength;

const BASE = "/api/v1/pois";

const lockedResponse = () =>
  HttpResponse.json({ title: "poi_locked", detail: "Điểm đang bị khoá, hãy mở khoá trước khi sửa" }, { status: 409 });

export const poiHandlers = [
  http.get("/api/v1/translation-jobs", () => HttpResponse.json([])),
  http.get("/api/v1/content-limits", () => HttpResponse.json({ script_max_chars: SCRIPT_MAX_CHARS })),
  http.get(BASE, ({ request }) => {
    const url = new URL(request.url);
    const category = url.searchParams.get("category") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    return HttpResponse.json(findAll({ category, status }));
  }),

  // Giả lập upload: trả ảnh SVG nhúng sẵn thay cho URL Cloudinary
  http.post(`${BASE}/images`, () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#0d9488"/></svg>`;
    return HttpResponse.json({ url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}#${Date.now()}` }, { status: 201 });
  }),

  http.post(BASE, async ({ request }) => {
    const body = await request.json() as any;
    if (!body.name || body.lat == null || body.lng == null) {
      return HttpResponse.json({ detail: "name, lat, lng là bắt buộc" }, { status: 422 });
    }
    if (body.radius < 10 || body.radius > 200) {
      return HttpResponse.json({ detail: "radius phải từ 10–200m" }, { status: 422 });
    }
    const poi = create({
      ...body,
      script: body.script ?? "",
      summary: body.summary ?? null,
      images: body.images ?? [],
      script_status: "draft",
      script_version: 1,
      status: "active",
      created_by: "user-mock",
      updated_by: "user-mock",
    });
    return HttpResponse.json(poi, { status: 201 });
  }),

  http.get(`${BASE}/:id`, ({ params }) => {
    const poi = findById(params.id as string);
    if (!poi) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    return HttpResponse.json(poi);
  }),

  http.patch(`${BASE}/:id`, async ({ params, request }) => {
    const body = await request.json() as any;
    if (findById(params.id as string)?.status === "locked") return lockedResponse();
    const updated = update(params.id as string, body);
    if (!updated) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    return HttpResponse.json(updated);
  }),

  http.delete(`${BASE}/:id`, ({ params }) => {
    const ok = remove(params.id as string);
    if (!ok) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`${BASE}/:id/script`, async ({ params, request }) => {
    const body = await request.json() as any;
    const poi = findById(params.id as string);
    if (!poi) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    if (poi.status === "locked") return lockedResponse();
    if (poi.script_status === "in_review") {
      return HttpResponse.json({ detail: "Không sửa được script đang chờ duyệt" }, { status: 409 });
    }
    if (typeof body.script === "string" && Array.from(body.script).length > SCRIPT_MAX_CHARS) {
      return HttpResponse.json({ detail: `Script tối đa ${SCRIPT_MAX_CHARS} ký tự` }, { status: 422 });
    }
    // Sửa script đã duyệt thì về nháp và tăng phiên bản, giống backend
    const updated = update(
      params.id as string,
      poi.script_status === "approved"
        ? { script: body.script, script_status: "draft", script_version: poi.script_version + 1 }
        : { script: body.script },
    );
    return HttpResponse.json(updated);
  }),

  http.post(`${BASE}/:id/submit`, ({ params }) => {
    const poi = findById(params.id as string);
    if (!poi) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    if (poi.status === "locked") return lockedResponse();
    if (poi.script_status !== "draft") {
      return HttpResponse.json({ detail: "Chỉ submit từ draft" }, { status: 409 });
    }
    if (!poi.script.trim()) {
      return HttpResponse.json({ detail: "Kịch bản đang rỗng, chưa thể gửi duyệt" }, { status: 422 });
    }
    const updated = update(params.id as string, { script_status: "in_review", review_note: undefined });
    return HttpResponse.json(updated);
  }),

  http.post(`${BASE}/:id/approve`, ({ params }) => {
    const poi = findById(params.id as string);
    if (!poi) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    if (poi.status === "locked") return lockedResponse();
    if (poi.script_status !== "in_review") {
      return HttpResponse.json({ detail: "Chỉ approve từ in_review" }, { status: 409 });
    }
    const updated = update(params.id as string, { script_status: "approved" });
    return HttpResponse.json(updated);
  }),

  http.post(`${BASE}/:id/reject`, async ({ params, request }) => {
    const body = await request.json() as any;
    const poi = findById(params.id as string);
    if (!poi) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    if (poi.status === "locked") return lockedResponse();
    if (poi.script_status !== "in_review") {
      return HttpResponse.json({ detail: "Chỉ trả lại được script đang chờ duyệt" }, { status: 409 });
    }
    const updated = update(params.id as string, { script_status: "draft", review_note: body.review_note });
    return HttpResponse.json(updated);
  }),

  http.post(`${BASE}/:id/lock`, ({ params }) => {
    const updated = update(params.id as string, { status: "locked" });
    if (!updated) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    return HttpResponse.json({ ...updated, affected_tours: [] });
  }),

  http.post(`${BASE}/:id/unlock`, ({ params }) => {
    const updated = update(params.id as string, { status: "active" });
    if (!updated) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    return HttpResponse.json(updated);
  }),
];
