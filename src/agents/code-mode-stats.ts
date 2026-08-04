import type { CodeModeBridgeMethod } from "./code-mode-worker-types.js";

export const CODE_MODE_BRIDGE_METHODS = [
  "search",
  "describe",
  "call",
  "callValue",
  "nodes",
  "yield",
  "namespace",
  "agentSpawn",
  "agentWait",
  "skillsList",
  "skillsRead",
  "swarmNote",
] as const satisfies readonly CodeModeBridgeMethod[];

export type CodeModeStats = {
  controlCalls: {
    exec: number;
    wait: number;
  };
  bridgeCalls: Partial<Record<CodeModeBridgeMethod, number>>;
  workerRuns: {
    exec: number;
    resume: number;
  };
  bridgeLifecycle: {
    queued: number;
    started: number;
    settled: number;
    failed: number;
    cancelled: number;
    unresolved: number;
    queueWaitMs: number;
    activeMs: number;
  };
  outcomes: {
    completed: number;
    waiting: number;
    failed: number;
    aborted: number;
  };
};

type CodeModeStatsOwner = {
  current?: {
    codeModeStats?: CodeModeStats;
  };
};

export function createCodeModeStats(): CodeModeStats {
  return {
    controlCalls: { exec: 0, wait: 0 },
    bridgeCalls: {},
    workerRuns: { exec: 0, resume: 0 },
    bridgeLifecycle: {
      queued: 0,
      started: 0,
      settled: 0,
      failed: 0,
      cancelled: 0,
      unresolved: 0,
      queueWaitMs: 0,
      activeMs: 0,
    },
    outcomes: { completed: 0, waiting: 0, failed: 0, aborted: 0 },
  };
}

export function ensureCodeModeStats(owner?: CodeModeStatsOwner): CodeModeStats | undefined {
  const catalog = owner?.current;
  if (!catalog) {
    return undefined;
  }
  catalog.codeModeStats ??= createCodeModeStats();
  return catalog.codeModeStats;
}

export function cloneCodeModeStats(stats: CodeModeStats): CodeModeStats {
  return {
    controlCalls: { ...stats.controlCalls },
    bridgeCalls: { ...stats.bridgeCalls },
    workerRuns: { ...stats.workerRuns },
    bridgeLifecycle: { ...stats.bridgeLifecycle },
    outcomes: { ...stats.outcomes },
  };
}

export function mergeCodeModeStats(target: CodeModeStats, source: CodeModeStats): void {
  target.controlCalls.exec += source.controlCalls.exec;
  target.controlCalls.wait += source.controlCalls.wait;
  for (const method of CODE_MODE_BRIDGE_METHODS) {
    const count = source.bridgeCalls[method];
    if (count) {
      target.bridgeCalls[method] = (target.bridgeCalls[method] ?? 0) + count;
    }
  }
  target.workerRuns.exec += source.workerRuns.exec;
  target.workerRuns.resume += source.workerRuns.resume;
  for (const key of [
    "queued",
    "started",
    "settled",
    "failed",
    "cancelled",
    "queueWaitMs",
    "activeMs",
  ] as const) {
    target.bridgeLifecycle[key] += source.bridgeLifecycle[key];
  }
  target.bridgeLifecycle.unresolved = source.bridgeLifecycle.unresolved;
  target.outcomes.completed += source.outcomes.completed;
  target.outcomes.waiting += source.outcomes.waiting;
  target.outcomes.failed += source.outcomes.failed;
  target.outcomes.aborted += source.outcomes.aborted;
}

export function recordCodeModeControlCall(
  stats: CodeModeStats | undefined,
  control: keyof CodeModeStats["controlCalls"],
): void {
  if (stats) {
    stats.controlCalls[control] += 1;
  }
}

export function recordCodeModeWorkerRun(
  stats: CodeModeStats | undefined,
  kind: keyof CodeModeStats["workerRuns"],
): void {
  if (stats) {
    stats.workerRuns[kind] += 1;
  }
}

export function recordCodeModeOutcome(
  stats: CodeModeStats | undefined,
  outcome: keyof CodeModeStats["outcomes"],
): void {
  if (stats) {
    stats.outcomes[outcome] += 1;
  }
}
