import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => {
  class OwnerNotPublishedError extends Error {}
  return {
    OwnerNotPublishedError,
    authStorage: {},
    modelRegistry: {},
    preparedSnapshot: {
      createStores: vi.fn(),
    },
    acquireRuntime: vi.fn(),
    release: vi.fn(),
    resolveModelAsync: vi.fn(async () => ({
      model: {
        id: "chat-latest",
        name: "chat-latest",
        provider: "openai",
        api: "openai-responses",
        baseUrl: "https://api.openai.com/v1",
      },
    })),
  };
});

runtimeMocks.preparedSnapshot.createStores.mockReturnValue({
  authStorage: runtimeMocks.authStorage,
  modelRegistry: runtimeMocks.modelRegistry,
});
runtimeMocks.acquireRuntime.mockResolvedValue({
  snapshot: runtimeMocks.preparedSnapshot,
  release: runtimeMocks.release,
});

vi.mock("./prepared-model-runtime.js", () => ({
  PreparedModelRuntimeOwnerNotPublishedError: runtimeMocks.OwnerNotPublishedError,
  acquireReadOnlyPreparedModelRuntime: runtimeMocks.acquireRuntime,
}));

vi.mock("./embedded-agent-runner/model.js", () => ({
  resolveModel: () => {
    throw new runtimeMocks.OwnerNotPublishedError("owner missing");
  },
  resolveModelAsync: runtimeMocks.resolveModelAsync,
}));

vi.mock("./embedded-agent-runner/model.static-catalog.js", () => ({
  resolveBundledStaticCatalogModel: () => undefined,
}));

vi.mock("./agent-tools.js", () => ({
  createOpenClawCodingTools: () => [],
}));

vi.mock("./agent-tools.policy.js", () => ({
  resolveEffectiveToolPolicy: () => ({}),
}));

vi.mock("./agent-scope.js", () => ({
  resolveAgentDir: () => "/tmp/agents/main/agent",
  resolveAgentWorkspaceDir: () => "/tmp/workspace-main",
  resolveDefaultAgentDir: () => "/tmp/agents/main/agent",
  resolveSessionAgentId: () => "main",
}));

describe("resolveEffectiveToolInventoryRuntimeModelContextAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prepares dynamic model context when no lifecycle owner exists", async () => {
    const { resolveEffectiveToolInventoryRuntimeModelContextAsync } =
      await import("./tools-effective-inventory.js");

    await expect(
      resolveEffectiveToolInventoryRuntimeModelContextAsync({
        cfg: {},
        agentId: "main",
        agentDir: "/tmp/agents/main/agent",
        workspaceDir: "/tmp/workspace-main",
        modelProvider: "openai",
        modelId: "chat-latest",
      }),
    ).resolves.toMatchObject({
      modelApi: "openai-responses",
      runtimeModel: { id: "chat-latest", provider: "openai" },
    });
    expect(runtimeMocks.resolveModelAsync).toHaveBeenCalledWith(
      "openai",
      "chat-latest",
      "/tmp/agents/main/agent",
      {},
      {
        agentId: "main",
        workspaceDir: "/tmp/workspace-main",
        authStorage: runtimeMocks.authStorage,
        modelRegistry: runtimeMocks.modelRegistry,
        preparedModelRuntime: runtimeMocks.preparedSnapshot,
      },
    );
    expect(runtimeMocks.acquireRuntime).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.release).toHaveBeenCalledTimes(1);
  });

  it("uses one lifecycle acquisition when the inventory resolves its own model context", async () => {
    const { resolveEffectiveToolInventory } = await import("./tools-effective-inventory.js");

    await resolveEffectiveToolInventory({
      cfg: {},
      agentId: "main",
      agentDir: "/tmp/agents/main/agent",
      workspaceDir: "/tmp/workspace-main",
      modelProvider: "openai",
      modelId: "chat-latest",
    });

    expect(runtimeMocks.acquireRuntime).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.resolveModelAsync).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.release).toHaveBeenCalledTimes(1);
  });

  it("does not acquire model context when explicit empty context is supplied", async () => {
    const { resolveEffectiveToolInventory } = await import("./tools-effective-inventory.js");

    await resolveEffectiveToolInventory({
      cfg: {},
      agentId: "main",
      agentDir: "/tmp/agents/main/agent",
      workspaceDir: "/tmp/workspace-main",
      modelProvider: "openai",
      modelId: "chat-latest",
      modelApi: null,
      runtimeModel: undefined,
    });

    expect(runtimeMocks.acquireRuntime).not.toHaveBeenCalled();
    expect(runtimeMocks.resolveModelAsync).not.toHaveBeenCalled();
  });
});
