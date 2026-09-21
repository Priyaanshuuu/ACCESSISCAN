type InterruptedScan = { id: string; status: "RUNNING" | "QUEUED"; updatedAt: Date };
type ScanJobSnapshot = { data: { scanId: string; identity: string }; getState(): Promise<string> };

export function isTerminalJobFailure(state: string) {
  // BullMQ also emits "failed" for attempts that are about to be retried.
  return state === "failed";
}

export async function reconcileInterruptedScans(dependencies: {
  listStaleScans(): Promise<InterruptedScan[]>;
  listJobs(): Promise<ScanJobSnapshot[]>;
  markFailed(scan: InterruptedScan, reason: string): Promise<boolean>;
  releaseSlot(identity: string): Promise<void>;
}) {
  const scans = await dependencies.listStaleScans();
  if (!scans.length) return 0;
  // If Redis is unavailable, throw before changing any scan status.
  const jobs = new Map((await dependencies.listJobs()).map((job) => [job.data.scanId, job]));
  let repaired = 0;
  for (const scan of scans) {
    const job = jobs.get(scan.id);
    const state = job ? await job.getState() : "missing";
    if (!["failed", "completed", "missing", "unknown"].includes(state)) continue;
    const reason = state === "failed"
      ? "The scan stopped after its queue retries were exhausted. Please run a new scan."
      : "The worker was interrupted and no runnable job remains for this scan. Please run a new scan.";
    // The caller compares status + updatedAt so a newer attempt/completion wins races.
    if (await dependencies.markFailed(scan, reason)) {
      repaired++;
      if (job) await dependencies.releaseSlot(job.data.identity);
    }
  }
  return repaired;
}
