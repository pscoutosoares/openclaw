import type { AssistantMessage } from "openclaw/plugin-sdk/llm";
import { describe, expect, it, vi } from "vitest";
import { createCodeModeStats, type CodeModeStats } from "../../code-mode-stats.js";
import { recordRunAttemptDispatch } from "../run-attempt-stats.js";
import { createUsageAccumulator } from "../usage-accumulator.js";
import { createEmbeddedRunContextRecoveryState } from "./context-recovery-state.js";
import type { EmbeddedRunAttemptResult } from "./types.js";

vi.mock("./payloads.js", () => ({
  buildEmbeddedRunPayloads: () => [],
}));
vi.mock("./run-attempt-result.js", () => ({
  buildTraceToolSummary: () => undefined,
}));
vi.mock("./tool-media-payloads.js", () => ({
  mergeAttemptToolMediaPayloads: ({ payloads }: { payloads?: unknown[] }) => payloads,
}));

function assistantMessage(stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
  return {
    api: "responses",
    provider: "openai",
    model: "gpt-5.4",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    role: "assistant",
    content: [
      {
        type: "text",
        text: "provider error details",
        textSignature: JSON.stringify({ v: 1, id: "item_final", phase: "final_answer" }),
      },
    ],
    timestamp: 0,
    stopReason,
    ...(stopReason === "error" ? { errorMessage: "provider failed" } : {}),
  };
}

function attemptResult(
  overrides: Partial<EmbeddedRunAttemptResult> = {},
): EmbeddedRunAttemptResult {
  const assistant = assistantMessage("error");
  return {
    terminal: { kind: "ok" },
    sessionIdUsed: "session-1",
    messagesSnapshot: [assistant],
    assistantTexts: ["provider error details"],
    toolMetas: [],
    lastAssistant: assistant,
    currentAttemptAssistant: assistant,
    currentAttemptCompletedAssistant: assistant,
    didSendViaMessagingTool: false,
    messagingToolSentTexts: [],
    messagingToolSentMediaUrls: [],
    messagingToolSentTargets: [],
    cloudCodeAssistFormatError: false,
    replayMetadata: { hadPotentialSideEffects: false, replaySafe: true },
    itemLifecycle: { startedCount: 0, completedCount: 0, activeCount: 0 },
    ...overrides,
  };
}

describe("prepareEmbeddedRunTerminal", () => {
  it.each(["error", "aborted"] as const)(
    "does not use %s assistant text as final terminal text",
    async (stopReason) => {
      const { prepareEmbeddedRunTerminal } = await import("./terminal-preparation.js");
      const assistant = assistantMessage(stopReason);
      const prepared = prepareEmbeddedRunTerminal({
        runParams: {
          sessionId: "session-1",
          runId: "run-1",
          workspaceDir: "/tmp/openclaw-test",
          prompt: "hi",
          trigger: "user",
          timeoutMs: 60_000,
        },
        attempt: attemptResult({
          lastAssistant: assistant,
          currentAttemptAssistant: assistant,
          currentAttemptCompletedAssistant: assistant,
        }),
        currentAttemptCompletedAssistant: assistant,
        provider: "openai",
        model: "gpt-5.4",
        activeErrorContext: { provider: "openai", model: "gpt-5.4" },
        authProfileStore: { version: 1, profiles: {} },
        sessionIdUsed: "session-1",
        outerContextTokenMeta: {},
        usageAccumulator: createUsageAccumulator(),
        contextRecoveryState: createEmbeddedRunContextRecoveryState(),
        resolvedToolResultFormat: "markdown",
        terminalState: {
          outcome:
            stopReason === "aborted"
              ? { reason: "aborted", status: "error", stopReason }
              : { reason: "failed", status: "error", stopReason, error: "provider failed" },
          signalOwnedInterruption: false,
        },
      });

      expect(prepared.finalAssistantVisibleText).toBeUndefined();
      expect(prepared.finalAssistantRawText).toBeUndefined();
    },
  );
});

describe("prepareEmbeddedRunTerminal run stats", () => {
  type StatsInput = {
    attempt?: Partial<EmbeddedRunAttemptResult>;
    assistantTurns?: number;
    bridgeCalls?: { search: number; describe: number; call: number };
    codeModeStats?: CodeModeStats;
    accumulatedCodeModeEngaged?: boolean;
    runAttempts?: number;
    config?: unknown;
    provider?: string;
    model?: string;
    usage?: Partial<
      Pick<
        ReturnType<typeof createUsageAccumulator>,
        "input" | "output" | "cacheRead" | "cacheWrite" | "total"
      >
    >;
  };

  async function prepareStats(statsInput: StatsInput = {}) {
    const { prepareEmbeddedRunTerminal } = await import("./terminal-preparation.js");
    const provider = statsInput.provider ?? "cost-test-provider";
    const model = statsInput.model ?? "cost-model";
    const assistant = {
      ...assistantMessage("stop"),
      provider,
      model,
    };
    const usageAccumulator = createUsageAccumulator();
    Object.assign(usageAccumulator, statsInput.usage);
    usageAccumulator.assistantTurns = statsInput.assistantTurns ?? 0;
    usageAccumulator.bridgeCalls = statsInput.bridgeCalls;
    usageAccumulator.codeModeStats = statsInput.codeModeStats;
    usageAccumulator.codeModeEngaged = statsInput.accumulatedCodeModeEngaged ?? false;
    for (let attempt = 0; attempt < (statsInput.runAttempts ?? 0); attempt += 1) {
      recordRunAttemptDispatch(usageAccumulator.runAttemptCounter);
    }
    return prepareEmbeddedRunTerminal({
      runParams: {
        sessionId: "session-1",
        runId: "run-1",
        workspaceDir: "/tmp/openclaw-test",
        prompt: "hi",
        trigger: "user",
        timeoutMs: 60_000,
        ...(statsInput.config ? { config: statsInput.config as never } : {}),
      },
      attempt: attemptResult({
        lastAssistant: assistant,
        currentAttemptAssistant: assistant,
        currentAttemptCompletedAssistant: assistant,
        ...statsInput.attempt,
      }),
      currentAttemptCompletedAssistant: assistant,
      provider,
      model,
      activeErrorContext: { provider, model },
      authProfileStore: { version: 1, profiles: {} },
      sessionIdUsed: "session-1",
      outerContextTokenMeta: {},
      usageAccumulator,
      contextRecoveryState: createEmbeddedRunContextRecoveryState(),
      resolvedToolResultFormat: "markdown",
      terminalState: {
        outcome: { reason: "completed", status: "ok", stopReason: "stop" },
        signalOwnedInterruption: false,
      },
    });
  }

  const COST_CONFIG = {
    models: {
      providers: {
        "cost-test-provider": {
          models: [
            {
              id: "cost-model",
              cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 4 },
            },
          ],
        },
      },
    },
  };

  it.each([
    { name: "engaged", codeModeEngaged: true, expected: true },
    { name: "not engaged", codeModeEngaged: false, expected: false },
    { name: "unreported (harness route)", codeModeEngaged: undefined, expected: false },
  ])("stamps codeModeEngaged when $name", async ({ codeModeEngaged, expected }) => {
    const prepared = await prepareStats({ attempt: { codeModeEngaged } });
    expect(prepared.agentMeta.codeModeEngaged).toBe(expected);
  });

  it.each([
    {
      name: "failed primary engaged and winner did not",
      accumulatedCodeModeEngaged: true,
      codeModeEngaged: false,
    },
    {
      name: "failed primary did not engage and winner did",
      accumulatedCodeModeEngaged: false,
      codeModeEngaged: true,
    },
  ])(
    "retains run-wide Code Mode engagement when $name",
    async ({ accumulatedCodeModeEngaged, codeModeEngaged }) => {
      const prepared = await prepareStats({
        accumulatedCodeModeEngaged,
        attempt: { codeModeEngaged },
      });
      expect(prepared.agentMeta.codeModeEngaged).toBe(true);
    },
  );

  it("stamps assistantTurns from the run accumulator and omits zero", async () => {
    const counted = await prepareStats({ assistantTurns: 3 });
    expect(counted.agentMeta.assistantTurns).toBe(3);

    const empty = await prepareStats({ assistantTurns: 0 });
    expect(empty.agentMeta).not.toHaveProperty("assistantTurns");
  });

  it("stamps run-accumulated bridge call counts and omits them when absent", async () => {
    const withBridge = await prepareStats({
      bridgeCalls: { search: 2, describe: 1, call: 5 },
    });
    expect(withBridge.agentMeta.bridgeCalls).toEqual({ search: 2, describe: 1, call: 5 });

    const withoutBridge = await prepareStats({});
    expect(withoutBridge.agentMeta).not.toHaveProperty("bridgeCalls");
  });

  it("stamps detailed Code Mode accounting and omits it when absent", async () => {
    const codeModeStats = createCodeModeStats();
    codeModeStats.controlCalls.exec = 1;
    codeModeStats.bridgeCalls.callValue = 2;
    codeModeStats.workerRuns.exec = 1;
    codeModeStats.outcomes.completed = 1;

    const withStats = await prepareStats({ codeModeStats });
    expect(withStats.agentMeta.codeModeStats).toEqual(codeModeStats);

    const withoutStats = await prepareStats({});
    expect(withoutStats.agentMeta).not.toHaveProperty("codeModeStats");
  });

  it("stamps authoritative dispatch counts before trace classification", async () => {
    const counted = await prepareStats({ runAttempts: 2 });
    expect(counted.agentMeta.runAttempts).toEqual({
      total: 2,
      retries: 1,
      byResult: {},
      unrecorded: 2,
    });
  });

  it("computes costUsd from accumulated usage including cache pricing", async () => {
    const prepared = await prepareStats({
      config: COST_CONFIG,
      usage: {
        input: 1_000_000,
        output: 500_000,
        cacheRead: 2_000_000,
        cacheWrite: 250_000,
        total: 3_750_000,
      },
    });
    // (1M*$1 + 0.5M*$2 + 2M*$0.5 + 0.25M*$4) per million tokens.
    expect(prepared.agentMeta.costUsd).toBeCloseTo(4, 10);
  });

  it("omits costUsd when the model has no cost data", async () => {
    const prepared = await prepareStats({
      provider: "no-cost-provider",
      model: "uncosted-model",
      config: COST_CONFIG,
      usage: { input: 1_000_000, output: 500_000, total: 1_500_000 },
    });
    expect(prepared.agentMeta).not.toHaveProperty("costUsd");
  });

  it("omits costUsd when the run reported no usage", async () => {
    const prepared = await prepareStats({ config: COST_CONFIG });
    expect(prepared.agentMeta).not.toHaveProperty("costUsd");
  });
});
