import { describe, expect, it } from "vitest";
import { createRunAttemptCounter, projectRunAttemptStats } from "../run-attempt-stats.js";
import {
  beginRunAttempt,
  createRunRetryBudget,
  isRunRetryBudgetExhausted,
  recordRunRetry,
  resolveRunRetryKind,
} from "./retry-budget.js";

describe("run retry budget", () => {
  it("allows more than 32 progressing continuations", () => {
    const budget = createRunRetryBudget(32);

    for (let step = 0; step < 33; step += 1) {
      beginRunAttempt(budget);
      recordRunRetry(
        budget,
        resolveRunRetryKind({
          preflightRecovery: {
            route: "truncate_tool_results_only",
            truncatedCount: 0,
          },
          retryingFromTranscript: true,
          toolMetas: [{ toolName: "read", meta: `step=${step}`, isError: false }],
        }),
      );
    }

    expect(budget).toEqual({ attemptsDispatched: 33, attemptsCounted: 0, maxAttempts: 32 });
    expect(isRunRetryBudgetExhausted(budget)).toBe(false);
  });

  it("still stops 32 retries that make no progress", () => {
    const budget = createRunRetryBudget(32);

    for (let retry = 0; retry < 32; retry += 1) {
      beginRunAttempt(budget);
      recordRunRetry(budget, "recovery");
    }

    expect(isRunRetryBudgetExhausted(budget)).toBe(true);
  });

  it("does not erase retries used before a progress continuation", () => {
    const budget = createRunRetryBudget(32);
    for (let retry = 0; retry < 31; retry += 1) {
      beginRunAttempt(budget);
      recordRunRetry(budget, "recovery");
    }

    beginRunAttempt(budget);
    recordRunRetry(budget, "progress_continuation");
    expect(budget.attemptsCounted).toBe(31);

    beginRunAttempt(budget);
    recordRunRetry(budget, "recovery");
    expect(isRunRetryBudgetExhausted(budget)).toBe(true);
  });

  it("counts untraced dispatch retries at the retry-budget owner", () => {
    const budget = createRunRetryBudget(32);
    const counter = createRunAttemptCounter();

    // Unsupported-thinking retries dispatch again without adding a trace outcome.
    beginRunAttempt(budget, counter);
    beginRunAttempt(budget, counter);

    expect(
      projectRunAttemptStats(counter, [
        { provider: "anthropic", model: "claude-test", result: "success" },
      ]),
    ).toEqual({
      total: 2,
      retries: 1,
      byResult: { success: 1 },
      unrecorded: 1,
    });
  });
});
