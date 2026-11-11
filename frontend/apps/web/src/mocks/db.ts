export type PoiStatus = "draft" | "in_review" | "approved";

export interface Poi {
  id: string;
  name: string;
  summary: string | null;
  images: string[];
  lat: number;
  lng: number;
  radius: number;
  category: string;
  priority: number;
  script: string;
  script_status: PoiStatus;
  script_version: number;
  review_note?: string;
  status: "active" | "locked";
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

let _id = 1;
const makeId = () => String(_id++);

export const db: Poi[] = [
  {
    id: makeId(),
    name: "Chùa Ngọc Hoàng",
    summary: null,
    images: [],
    lat: 10.7881,
    lng: 106.6978,
    radius: 40,
    category: "temple",
    priority: 1,
    script: "Chùa Ngọc Hoàng, còn gọi là Phước Hải Tự, là một trong những ngôi chùa cổ nhất Sài Gòn.",
    script_status: "draft",
    script_version: 1,
    status: "active",
    created_by: "user-01",
    updated_by: "user-01",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: makeId(),
    name: "Nhà thờ Đức Bà",
    summary: null,
    images: [],
    lat: 10.7797,
    lng: 106.6990,
    radius: 100,
    category: "church",
    priority: 2,
    script: "Nhà thờ Đức Bà Sài Gòn được xây dựng từ năm 1863, là biểu tượng nổi bật nhất của thành phố.",
    script_status: "in_review",
    script_version: 1,
    status: "active",
    created_by: "user-01",
    updated_by: "user-01",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export function findAll(filters?: { category?: string; status?: string }) {
  return db.filter((a) => {
    if (filters?.category && a.category !== filters.category) return false;
    if (filters?.status && a.script_status !== filters.status) return false;
    return true;
  });
}

export function findById(id: string) {
  return db.find((a) => a.id === id);
}

export function create(data: {
  name: string;
  summary: string | null;
  images: string[];
  lat: number;
  lng: number;
  radius: number;
  category: string;
  priority: number;
  script: string;
  script_status: PoiStatus;
  script_version: number;
  review_note?: string;
  status: "active" | "locked";
  created_by: string;
  updated_by: string;
}) {
  const now = new Date().toISOString();
  const poi: Poi = {
    id: makeId(),
    created_at: now,
    updated_at: now,
    ...data,
  };
  db.push(poi);
  return poi;
}

export function update(id: string, data: Partial<Poi>) {
  const idx = db.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  db[idx] = { ...db[idx], ...data, updated_at: new Date().toISOString() } as Poi;
  return db[idx];
}

export function remove(id: string) {
  const idx = db.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  db.splice(idx, 1);
  return true;
}