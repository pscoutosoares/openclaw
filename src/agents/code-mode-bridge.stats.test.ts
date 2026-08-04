import { describe, expect, it } from "vitest";
import { runBridgeRequest } from "./code-mode-bridge.js";
import { createCodeModeNamespaceRuntime } from "./code-mode-namespaces.js";
import { CODE_MODE_BRIDGE_METHODS, createCodeModeStats } from "./code-mode-stats.js";
import type { CodeModeBridgeMethod } from "./code-mode-worker-types.js";
import {
  createToolSearchCatalogRef,
  registerHeadlessToolSearchCatalog,
  ToolSearchRuntime,
} from "./tool-search.js";

describe("Code Mode bridge method stats", () => {
  it("accounts for every guest bridge method at the dispatch owner", async () => {
    const catalogRef = createToolSearchCatalogRef();
    registerHeadlessToolSearchCatalog({ catalogRef, tools: [] });
    const stats = createCodeModeStats();
    catalogRef.current!.codeModeStats = stats;
    const ctx = { catalogRef };
    const runtime = new ToolSearchRuntime(
      ctx,
      {
        enabled: true,
        mode: "code",
        codeTimeoutMs: 1_000,
        searchDefaultLimit: 5,
        maxSearchLimit: 20,
      },
      { validateInput: true },
    );

    await Promise.all(
      CODE_MODE_BRIDGE_METHODS.map((method, index) =>
        runBridgeRequest({
          runtime,
          namespaceRuntime: createCodeModeNamespaceRuntime(),
          parentToolCallId: "parent",
          codeModeRunId: "run",
          ctx,
          request: {
            id: `bridge-${index}`,
            method,
            args: invalidArgsForMethod(method),
          },
        }),
      ),
    );

    expect(stats.bridgeCalls).toEqual(
      Object.fromEntries(CODE_MODE_BRIDGE_METHODS.map((method) => [method, 1])),
    );
  });
});

function invalidArgsForMethod(method: CodeModeBridgeMethod): unknown[] {
  if (method === "yield" || method === "skillsList") {
    return [];
  }
  return [null];
}
