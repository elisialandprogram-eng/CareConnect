export type VisitType = "clinic" | "home" | "online";

/**
 * Schedule templates historically used home_visit/video while bookings use
 * home/online. Keep one canonical representation at the scheduling boundary.
 * null means a shared/general schedule that can serve any supported service mode.
 */
export function normalizeScheduleModality(value: unknown): VisitType | null {
  if (value == null || value === "" || value === "none" || value === "all" || value === "shared") {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "clinic") return "clinic";
  if (normalized === "home" || normalized === "home_visit" || normalized === "home-visit") return "home";
  if (normalized === "online" || normalized === "video" || normalized === "telemedicine") return "online";
  return null;
}

export function normalizeVisitType(value: unknown): VisitType {
  return value === "home" || value === "online" ? value : "clinic";
}

/**
 * Service locationMode is intentionally stricter than schedule modality:
 * "both" means clinic + home, while "all" means clinic + home + online.
 */
export function supportsVisitType(locationMode: unknown, visitType: VisitType): boolean {
  const mode = String(locationMode ?? "both").trim().toLowerCase();
  if (mode === "all") return true;
  if (mode === "both") return visitType === "clinic" || visitType === "home";
  if (mode === "clinic_only" || mode === "clinic") return visitType === "clinic";
  if (mode === "home_only" || mode === "home") return visitType === "home";
  if (mode === "online_only" || mode === "online" || mode === "video") return visitType === "online";
  if (mode === "clinic_online") return visitType === "clinic" || visitType === "online";
  if (mode === "home_online") return visitType === "home" || visitType === "online";
  return false;
}