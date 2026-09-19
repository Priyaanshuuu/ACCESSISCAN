import type { UserPlan } from "@prisma/client";

export const planLimits: Record<UserPlan, { maxDepth: number; maxPages: number }> = {
  FREE: { maxDepth: 0, maxPages: 1 },
  INDIE: { maxDepth: 2, maxPages: 10 },
  BUSINESS: { maxDepth: 3, maxPages: 50 },
  AGENCY: { maxDepth: 5, maxPages: 250 },
};