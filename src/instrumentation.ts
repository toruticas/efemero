export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const seconds = Number(process.env.CLEANUP_INTERVAL_SECONDS || 0);
  if (!Number.isInteger(seconds) || (seconds !== 0 && seconds < 60))
    throw new Error(
      "CLEANUP_INTERVAL_SECONDS must be 0 or an integer of at least 60.",
    );
  if (!seconds) return; // Vercel retains its existing external daily cron.
  if (process.env.VERCEL === "1")
    throw new Error("Use Vercel Cron instead of the standalone cleanup timer.");
  const state = globalThis as typeof globalThis & {
    __efemeroCleanup?: NodeJS.Timeout;
  };
  if (state.__efemeroCleanup) return;
  const { dailyCleanup } = await import("./server/daily-cleanup");
  const { artifacts } = await import("./server/services");
  let running = false;
  const cleanup = async () => {
    if (running) return;
    running = true;
    try {
      await dailyCleanup(artifacts());
    } catch {
      console.error(
        "Artifact cleanup failed; it will be retried. Sensitive details omitted.",
      );
    } finally {
      running = false;
    }
  };
  state.__efemeroCleanup = setInterval(() => {
    void cleanup();
  }, seconds * 1000);
  state.__efemeroCleanup.unref();
  void cleanup();
}
