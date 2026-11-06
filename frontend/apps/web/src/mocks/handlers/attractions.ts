import { http, HttpResponse } from "msw";
import { findAll, findById, create, update, remove } from "../db";

const BASE = "/api/v1/attractions";

export const attractionHandlers = [
  http.get(BASE, ({ request }) => {
    const url = new URL(request.url);
    const category = url.searchParams.get("category") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    return HttpResponse.json(findAll({ category, status }));
  }),

  http.post(BASE, async ({ request }) => {
    const body = await request.json() as any;
    if (!body.name || body.lat == null || body.lng == null) {
      return HttpResponse.json({ detail: "name, lat, lng là bắt buộc" }, { status: 422 });
    }
    if (body.radius < 10 || body.radius > 200) {
      return HttpResponse.json({ detail: "radius phải từ 10–200m" }, { status: 422 });
    }
    const attraction = create({
      ...body,
      slug: body.name.toLowerCase().replace(/\s+/g, "-"),
      script: body.script ?? "",
      summary: body.summary ?? null,
      images: body.images ?? [],
      script_status: "draft",
      script_version: 1,
      created_by: "user-mock",
      updated_by: "user-mock",
    });
    return HttpResponse.json(attraction, { status: 201 });
  }),

  http.get(`${BASE}/:id`, ({ params }) => {
    const attraction = findById(params.id as string);
    if (!attraction) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    return HttpResponse.json(attraction);
  }),

  http.patch(`${BASE}/:id`, async ({ params, request }) => {
    const body = await request.json() as any;
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
    const attraction = findById(params.id as string);
    if (!attraction) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    if (attraction.script_status === "in_review") {
      return HttpResponse.json({ detail: "Không sửa được script đang chờ duyệt" }, { status: 409 });
    }
    if (body.script?.length > 600) {
      return HttpResponse.json({ detail: "Script tối đa 600 ký tự/đoạn" }, { status: 422 });
    }
    // Sửa script đã duyệt thì về nháp và tăng phiên bản, giống backend
    const updated = update(
      params.id as string,
      attraction.script_status === "approved"
        ? { script: body.script, script_status: "draft", script_version: attraction.script_version + 1 }
        : { script: body.script },
    );
    return HttpResponse.json(updated);
  }),

  http.post(`${BASE}/:id/submit`, ({ params }) => {
    const attraction = findById(params.id as string);
    if (!attraction) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    if (attraction.script_status !== "draft") {
      return HttpResponse.json({ detail: "Chỉ submit từ draft" }, { status: 409 });
    }
    if (!attraction.script.trim()) {
      return HttpResponse.json({ detail: "Kịch bản đang rỗng, chưa thể gửi duyệt" }, { status: 422 });
    }
    const updated = update(params.id as string, { script_status: "in_review", review_note: undefined });
    return HttpResponse.json(updated);
  }),

  http.post(`${BASE}/:id/approve`, ({ params }) => {
    const attraction = findById(params.id as string);
    if (!attraction) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    if (attraction.script_status !== "in_review") {
      return HttpResponse.json({ detail: "Chỉ approve từ in_review" }, { status: 409 });
    }
    const updated = update(params.id as string, { script_status: "approved" });
    return HttpResponse.json(updated);
  }),

  http.post(`${BASE}/:id/reject`, async ({ params, request }) => {
    const body = await request.json() as any;
    const attraction = findById(params.id as string);
    if (!attraction) return HttpResponse.json({ detail: "Không tìm thấy" }, { status: 404 });
    if (attraction.script_status !== "in_review") {
      return HttpResponse.json({ detail: "Chỉ trả lại được script đang chờ duyệt" }, { status: 409 });
    }
    const updated = update(params.id as string, { script_status: "draft", review_note: body.review_note });
    return HttpResponse.json(updated);
  }),
];