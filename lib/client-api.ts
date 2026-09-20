import type { UserPlan } from "@prisma/client";
import { hasPaidPlan } from "./plan-limits";

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : `Request failed (${response.status}). Please try again.`,
    );
  }
  if (data === null) throw new Error("The server returned an invalid response. Please try again.");
  return data as T;
}

export async function getPaidResource<T>(plan: UserPlan, url: string, empty: T): Promise<T> {
  return hasPaidPlan(plan) ? requestJson<T>(url) : empty;
}
