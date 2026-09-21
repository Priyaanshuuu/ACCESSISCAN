export const products = {
  SCANS: { amountPaise: 10000, name: "One scan" },
  SCHEDULING: { amountPaise: 25000, name: "Email scheduling" },
} as const;

export type Product = keyof typeof products;

export function isProduct(value: unknown): value is Product {
  return value === "SCANS" || value === "SCHEDULING";
}

export function hasActiveAccess(until: Date | string | null | undefined, now = new Date()) {
  return Boolean(until && new Date(until).getTime() > now.getTime());
}

export function hasLegacyScanAccess(user: { plan: string; scansAccessUntil: Date | string | null }, now = new Date()) {
  return ["INDIE", "BUSINESS", "AGENCY"].includes(user.plan) || hasActiveAccess(user.scansAccessUntil, now);
}

export function hasScanAccess(user: { plan: string; scansAccessUntil: Date | string | null; scanCredits: number }, now = new Date()) {
  return user.scanCredits > 0 || hasLegacyScanAccess(user, now);
}

export function extendMonth(until: Date | null, now = new Date()) {
  const start = until && until > now ? until : now;
  const result = new Date(start);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
