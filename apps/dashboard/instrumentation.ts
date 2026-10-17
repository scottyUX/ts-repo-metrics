// Next.js calls register() once when the server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.CSE115A_WORKER === "true") {
    const { startCse115aWorker } = await import("@/lib/cse115a/jobs/worker");
    startCse115aWorker();
  }
}
