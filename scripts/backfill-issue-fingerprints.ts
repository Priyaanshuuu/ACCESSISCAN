import crypto from "node:crypto";

import { prisma } from "../lib/prisma";

async function main() {
  const issues = await prisma.issue.findMany({
    where: { fingerprint: null },
  });

  for (const issue of issues) {
    const target = Array.isArray(issue.targets) && issue.targets.length > 0 ? issue.targets[0] : "";
    const fingerprint = crypto
      .createHash("sha256")
      .update(`${issue.rule}:${JSON.stringify(target)}`)
      .digest("hex");

    await prisma.issue.update({
      data: { fingerprint },
      where: { id: issue.id },
    });
  }

  console.log(`Backfilled ${issues.length} issue fingerprints.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
