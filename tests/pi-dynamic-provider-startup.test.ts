import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  DefaultResourceLoader, ModelRuntime, SettingsManager, resolveCliModel,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import cliproxyapi from "../extensions/cliproxyapi-dynamic-provider";
import nineRouter from "../extensions/9router-dynamic-provider";

let originalFetch: typeof fetch;
const savedEnv = new Map<string, string | undefined>();
beforeEach(() => {
  originalFetch = globalThis.fetch;
  for (const name of ["CLIPROXYAPI_API_KEY", "CLIPROXYAPI_BASE_URL", "NINEROUTER_API_KEY", "NINEROUTER_BASE_URL", "PI_OFFLINE"]) {
    savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.CLIPROXYAPI_API_KEY = "synthetic-key";
  process.env.NINEROUTER_API_KEY = "synthetic-key";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  savedEnv.clear();
});

async function load(factory: ExtensionFactory) {
  const loader = new DefaultResourceLoader({
    cwd: process.cwd(), agentDir: process.cwd(),
    settingsManager: SettingsManager.inMemory(),
    noExtensions: true, noSkills: true, noPromptTemplates: true,
    noThemes: true, noContextFiles: true, extensionFactories: [factory],
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  expect(loaded.errors).toEqual([]);
  const runtime = await ModelRuntime.create({
    modelsPath: null, refreshOnCreate: false,
    credentials: {
      read: async () => undefined, list: async () => [],
      modify: async () => { throw new Error("Unexpected credential write"); },
      delete: async () => { throw new Error("Unexpected credential delete"); },
    },
  });
  for (const { name, config } of loaded.runtime.pendingProviderRegistrations) {
    runtime.registerProvider(name, config);
  }
  // Drain registration's queued cache-only availability refresh before returning.
  await runtime.refresh({ allowNetwork: false });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return runtime;
}

for (const [provider, factory, id] of [
  ["cliproxyapi", cliproxyapi, "gpt-6-luna"],
  ["9router", nineRouter, "cx/gpt-6-sol"],
] as const) {
  test(`${provider}: awaited factory baseline resolves before runtime network refresh`, async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return Response.json(provider === "cliproxyapi"
        ? { models: [{ slug: id, supported_reasoning_levels: [{ effort: "high" }] }] }
        : { data: [{ id }] });
    }) as typeof fetch;
    const old = await load(async (pi) => {
      await factory({ registerProvider: (name, config) => {
        const { models: _baseline, ...refreshOnly } = config;
        pi.registerProvider(name, {
          ...refreshOnly,
          refreshModels: async (context) => context.allowNetwork
            ? refreshOnly.refreshModels!(context)
            : [],
        });
      } } as never);
    });
    expect(resolveCliModel({ cliProvider: provider, cliModel: `${id}:high`, modelRuntime: old }).error).toBeDefined();
    expect(calls).toBe(1);
    const runtime = await load(factory);
    expect(calls).toBe(2);
    const startupCalls = calls;
    const resolved = resolveCliModel({ cliProvider: provider, cliModel: `${id}:high`, modelRuntime: runtime });
    expect(resolved.error).toBeUndefined();
    expect(resolved.model?.id).toBe(id);
    expect(resolved.thinkingLevel).toBe("high");
    expect(calls).toBe(startupCalls);
    await runtime.refresh({ allowNetwork: false, providers: [provider] });
    expect(calls).toBe(startupCalls);

    process.env.PI_OFFLINE = "1";
    await runtime.refresh({ allowNetwork: true, providers: [provider] });
    expect(calls).toBe(startupCalls);
    expect(runtime.getModel(provider, id)?.id).toBe(id);
    delete process.env.PI_OFFLINE;

    globalThis.fetch = (async () => {
      calls++;
      throw new Error("synthetic transport failure");
    }) as typeof fetch;
    await runtime.refresh({ allowNetwork: true, providers: [provider] });
    expect(resolveCliModel({ cliProvider: provider, cliModel: `${id}:high`, modelRuntime: runtime }).model?.id).toBe(id);

    globalThis.fetch = (async (_url, init) => {
      calls++;
      const signal = init!.signal!;
      signal.throwIfAborted();
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }) as typeof fetch;
    const controller = new AbortController();
    const cancelled = runtime.refresh({ allowNetwork: true, providers: [provider], signal: controller.signal });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await cancelled.catch(() => undefined);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(runtime.getModel(provider, id)?.id).toBe(id);

    const nextId = `${id}-updated`;
    globalThis.fetch = (async () => {
      calls++;
      return Response.json(provider === "cliproxyapi"
        ? { models: [{ slug: nextId }] } : { data: [{ id: nextId }] });
    }) as typeof fetch;
    await runtime.refresh({ allowNetwork: true, providers: [provider] });
    expect(runtime.getModel(provider, nextId)?.id).toBe(nextId);
    expect(runtime.getModel(provider, id)).toBeUndefined();
  });

  test(`${provider}: offline registration and automatic cache restoration never fetch`, async () => {
    process.env.PI_OFFLINE = "yes";
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new Error("unexpected synthetic network request");
    }) as typeof fetch;
    const runtime = await load(factory);
    await runtime.refresh({ allowNetwork: false, providers: [provider] });
    await runtime.refresh({ allowNetwork: true, providers: [provider] });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(0);
    expect(runtime.getModels(provider)).toEqual([]);
  });
}
