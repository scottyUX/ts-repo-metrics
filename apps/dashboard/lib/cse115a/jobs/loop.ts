// One poller loop: a tick, then the next one `intervalMs` after it finishes, never two at once. Each
// line of jobs (worker.ts) has its own loop, so a tick that hangs on one line (a clone, say) never
// holds up the other. No imports, so tests start real loops with in-memory stores.

export type JobLoop = { stop(): void };

export function startJobLoop(name: string, intervalMs: number, tick: () => Promise<void>): JobLoop {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    try {
      await tick();
    } catch (error) {
      console.error(`[cse115a ${name}] tick failed`, error);
    } finally {
      if (!stopped) {
        timer = setTimeout(run, intervalMs);
        timer.unref?.();
      }
    }
  };
  timer = setTimeout(run, intervalMs);
  timer.unref?.();
  return { stop() { stopped = true; clearTimeout(timer); } };
}
