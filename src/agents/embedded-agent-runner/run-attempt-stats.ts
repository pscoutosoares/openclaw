import type { RunAttemptStats, TraceAttempt } from "./types.js";

export type RunAttemptCounter = {
  total: number;
};

export function createRunAttemptCounter(): RunAttemptCounter {
  return { total: 0 };
}

export function recordRunAttemptDispatch(counter: RunAttemptCounter): void {
  counter.total += 1;
}

export function projectRunAttemptStats(
  counter: Pick<RunAttemptCounter, "total">,
  attempts?: readonly TraceAttempt[],
): RunAttemptStats {
  const byResult: RunAttemptStats["byResult"] = {};
  for (const attempt of attempts ?? []) {
    byResult[attempt.result] = (byResult[attempt.result] ?? 0) + 1;
  }
  const recorded = Object.values(byResult).reduce((total, count) => total + (count ?? 0), 0);
  return {
    total: counter.total,
    retries: Math.max(0, counter.total - 1),
    byResult,
    unrecorded: Math.max(0, counter.total - recorded),
  };
}
