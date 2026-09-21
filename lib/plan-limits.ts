import type { UserPlan } from "@prisma/client";

export const planLimits: Record<UserPlan, { maxDepth: number; maxPages: number }> = {
  PAID: { maxDepth: 2, maxPages: 10 },
  FREE: { maxDepth: 0, maxPages: 1 },
  INDIE: { maxDepth: 2, maxPages: 10 },
  BUSINESS: { maxDepth: 3, maxPages: 50 },
  AGENCY: { maxDepth: 5, maxPages: 250 },
};

export function hasPaidPlan(plan: UserPlan) {
  return plan !== "FREE";
}
