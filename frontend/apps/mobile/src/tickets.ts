import { getPref, setPref } from "./store";

/** Vé đã kích hoạt được lưu trên chính máy này (backend không có API liệt kê vé). */
export interface SavedTicket {
  code: string;
  tourIds: string[];
  activatedAt: string;
}

const KEY = "tickets";
const MAX_TICKETS = 10;

export function savedTickets(): SavedTicket[] {
  const raw = getPref(KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedTicket => {
      if (!item || typeof item !== "object") return false;
      const ticket = item as Partial<SavedTicket>;
      return typeof ticket.code === "string" && Array.isArray(ticket.tourIds)
        && ticket.tourIds.every((id) => typeof id === "string");
    });
  } catch {
    return [];
  }
}

export function saveTicket(code: string, tourIds: string[]): void {
  const ticket: SavedTicket = {
    code,
    tourIds: [...new Set(tourIds)],
    activatedAt: new Date().toISOString(),
  };
  const next = [ticket, ...savedTickets().filter((saved) => saved.code !== code)].slice(0, MAX_TICKETS);
  setPref(KEY, JSON.stringify(next));
}
