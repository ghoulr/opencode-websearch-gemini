import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import type { Auth as ProviderAuth, Config, Provider } from '@opencode-ai/sdk';

import { formatWebSearchResponse } from './src/google.ts';

const WEBSEARCH_CONFIG: Config = {
  provider: {
    google: {
      options: {
        websearch_grounded: {
          model: 'gemini-2.5-flash',
        },
      },
    },
  },
};

let importCounter = 0;

type GeminiGenerateContentResponse = Parameters<typeof formatWebSearchResponse>[0];

describe('formatWebSearchResponse', () => {
  it('returns fallback when Gemini response has no text', () => {
    const response = createResponse({
      content: {
        role: 'model',
        parts: [{ text: '' }],
      },
    });

    const result = formatWebSearchResponse(response, 'no results query');

    expect(result).toBe(
      'No search results or information found for query: "no results query"'
    );
  });

  it('formats results without sources', () => {
    const response = createResponse({
      content: {
        role: 'model',
        parts: [{ text: 'Here are your results.' }],
      },
    });

    const result = formatWebSearchResponse(response, 'successful query');

    expect(result).toBe('Here are your results.');
  });

  it('inserts citations and sources for grounding metadata', () => {
    const response = createResponse({
      content: {
        role: 'model',
        parts: [{ text: 'This is a test response.' }],
      },
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: 'https://example.com', title: 'Example Site' } },
          { web: { uri: 'https://google.com', title: 'Google' } },
        ],
        groundingSupports: [
          {
            segment: { startIndex: 5, endIndex: 14 },
            groundingChunkIndices: [0],
          },
          {
            segment: { startIndex: 15, endIndex: 24 },
            groundingChunkIndices: [0, 1],
          },
        ],
      },
    });

    const result = formatWebSearchResponse(response, 'grounding query');

    expect(result).toBe(
      'This is a test[1] response.[1][2]\n\nSources:\n[1] Example Site (https://example.com)\n[2] Google (https://google.com)'
    );
  });

  it('respects UTF-8 byte indices for citation insertion', () => {
    const response = createResponse({
      content: {
        role: 'model',
        parts: [{ text: 'こんにちは! Gemini CLI✨️' }],
      },
      groundingMetadata: {
        groundingChunks: [
          {
            web: {
              title: 'Japanese Greeting',
              uri: 'https://example.test/japanese-greeting',
            },
          },
          {
            web: {
              title: 'google-gemini/gemini-cli',
              uri: 'https://github.com/google-gemini/gemini-cli',
            },
          },
          {
            web: {
              title: 'Gemini CLI: your open-source AI agent',
              uri: 'https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/',
            },
          },
        ],
        groundingSupports: [
          {
            segment: { startIndex: 0, endIndex: 16 },
            groundingChunkIndices: [0],
          },
          {
            segment: { startIndex: 17, endIndex: 33 },
            groundingChunkIndices: [1, 2],
          },
        ],
      },
    });

    const result = formatWebSearchResponse(response, 'multibyte query');

    expect(result).toBe(
      'こんにちは![1] Gemini CLI✨️[2][3]\n\nSources:\n[1] Japanese Greeting (https://example.test/japanese-greeting)\n[2] google-gemini/gemini-cli (https://github.com/google-gemini/gemini-cli)\n[3] Gemini CLI: your open-source AI agent (https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/)'
    );
  });
});

describe('WebsearchGroundedPlugin', () => {
  let fetchMock: ReturnType<typeof vi.spyOn<typeof globalThis, 'fetch'>>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockRejectedValue(new Error('fetch mock not configured'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns configuration error when API key is missing', async () => {
    const { tool } = await createEnv(WEBSEARCH_CONFIG);

    const context = createToolContext();

    await expectThrowMessage(
      () => tool.execute({ query: 'opencode' }, context),
      'Missing auth for provider "google"'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns invalid model when websearch model is not configured', async () => {
    const { tool } = await createEnv();
    const context = createToolContext();

    await expectThrowMessage(
      () => tool.execute({ query: 'opencode' }, context),
      'Missing web search model configuration'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns invalid model when configured model is blank', async () => {
    await expectThrowMessage(
      () =>
        createEnv({
          provider: {
            google: {
              options: {
                websearch_grounded: { model: '' },
              },
            },
          },
        } as Config),
      'Missing websearch_grounded model for provider "google"'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects extra arguments', async () => {
    const { tool } = await createEnv();
    const context = createToolContext();

    await expectThrowMessage(
      () => tool.execute({ query: 'sample', format: 'markdown' } as never, context),
      "Unknown argument(s): format, only 'query' supported"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns successful search results', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse(
        createResponse({
          content: {
            role: 'model',
            parts: [{ text: 'Search body' }],
          },
          groundingMetadata: {
            groundingChunks: [
              { web: { title: 'Example', uri: 'https://example.com' } },
            ],
            groundingSupports: [
              {
                segment: { startIndex: 0, endIndex: 6 },
                groundingChunkIndices: [0],
              },
            ],
          },
        })
      )
    );

    const { hooks, tool } = await createEnv(WEBSEARCH_CONFIG);
    await invokeAuthLoader(hooks, 'google', { type: 'api', key: 'stored-key' });
    const context = createToolContext();

    const result = await tool.execute({ query: 'sample' }, context);

    expect(result).toContain('Search');
    expect(result).toContain('Sources:\n[1] Example (https://example.com)');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns Gemini failure details', async () => {
    const failure = new Error('API Failure');
    fetchMock.mockRejectedValueOnce(failure);

    const { hooks, tool } = await createEnv(WEBSEARCH_CONFIG);
    await invokeAuthLoader(hooks, 'google', { type: 'api', key: 'stored-key' });
    const context = createToolContext();

    try {
      await tool.execute({ query: 'sample' }, context);
      throw new Error('Expected execute to throw');
    } catch (error) {
      expect(error).toBe(failure);
    }
  });

  it('uses the API key from provider auth', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse(
        createResponse({
          content: {
            role: 'model',
            parts: [{ text: 'Stored key response' }],
          },
        })
      )
    );

    const { hooks, tool } = await createEnv(WEBSEARCH_CONFIG);
    await invokeAuthLoader(hooks, 'google', { type: 'api', key: 'stored-key' });
    const context = createToolContext();

    await tool.execute({ query: 'stored key query' }, context);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('stored-key');
  });

  it('uses the configured model', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse(
        createResponse({
          content: {
            role: 'model',
            parts: [{ text: 'Default model response' }],
          },
        })
      )
    );

    const { hooks, tool } = await createEnv({
      provider: {
        google: {
          options: {
            websearch_grounded: { model: 'gemini-custom-model' },
          },
        },
      },
    } as Config);
    await invokeAuthLoader(hooks, 'google', { type: 'api', key: 'stored-key' });
    const context = createToolContext();

    await tool.execute({ query: 'model query' }, context);

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(typeof url === 'string' ? url : '').toContain('gemini-custom-model');
  });

  it('returns invalid auth when OpenAI websearch is configured but auth is missing', async () => {
    const { tool } = await createEnv({
      provider: {
        openai: {
          options: {
            websearch_grounded: { model: 'gpt-4o-search-preview' },
          },
        },
      },
    } as Config);
    const context = createToolContext();

    await expectThrowMessage(
      () => tool.execute({ query: 'openai' }, context),
      'Missing auth for provider "openai"'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the OpenAI responses endpoint when configured and auth is present', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse(createOpenAIResponseBody('Search result body'))
    );

    const { hooks, tool } = await createEnv({
      provider: {
        openai: {
          options: {
            websearch_grounded: { model: 'gpt-4o-search-preview' },
          },
        },
      },
    } as Config);

    await invokeAuthLoader(hooks, 'openai', {
      type: 'oauth',
      access: 'test-access-token',
      refresh: 'test-refresh-token',
      expires: Date.now() + 60_000,
    });

    const context = createToolContext();

    const result = await tool.execute({ query: 'openai web search' }, context);

    expect(result).toContain('Search result body');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(typeof url === 'string' ? url : '').toContain('/codex/responses');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-access-token');
  });

  it('selects the first configured provider in order', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse(createOpenAIResponseBody('Search result body'))
    );

    const { hooks, tool } = await createEnv({
      provider: {
        openai: {
          options: {
            websearch_grounded: { model: 'gpt-4o-search-preview' },
          },
        },
        google: {
          options: {
            websearch_grounded: { model: 'gemini-2.5-flash' },
          },
        },
      },
    } as Config);

    await invokeAuthLoader(hooks, 'openai', {
      type: 'oauth',
      access: 'test-access-token',
      refresh: 'test-refresh-token',
      expires: Date.now() + 60_000,
    });

    const context = createToolContext();

    const result = await tool.execute({ query: 'openai web search' }, context);

    expect(result).toContain('Search result body');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(typeof url === 'string' ? url : '').toContain('/codex/responses');
  });

  it('index exports are valid plugin init functions', async () => {
    const mod = await importIndexModule();
    const entries = Object.entries(mod);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, value] of entries) {
      expect(name.trim()).not.toBe('');
      expect(typeof value).toBe('function');
    }
  });

  it('initializes all exports like opencode', async () => {
    const mod = await importIndexModule();
    const input = createPluginInput();
    const hooks: unknown[] = [];
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value !== 'function') {
        throw new Error(`Invalid plugin export "${name}"`);
      }
      hooks.push(await (value as Plugin)(input));
    }
    for (const hook of hooks) {
      expect(hook && typeof hook === 'object').toBe(true);
    }
  });
});

type CandidateInput = NonNullable<GeminiGenerateContentResponse['candidates']>[number];

async function expectThrowMessage(fn: () => Promise<unknown>, match: string) {
  try {
    await fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    expect(message).toContain(match);
  }
}

type Hooks = Awaited<ReturnType<Plugin>>;

type Tool = {
  execute: (args: unknown, context: unknown) => Promise<string>;
};

function isTool(value: unknown): value is Tool {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const execute = (value as Record<string, unknown>).execute;
  return typeof execute === 'function';
}

function createPluginInput(): PluginInput {
  return {} as PluginInput;
}

async function importIndexModule(): Promise<Record<string, unknown>> {
  importCounter += 1;
  const mod = (await import(`./index?agent_test=${importCounter}`)) as unknown;
  if (!mod || typeof mod !== 'object') {
    throw new Error('Invalid plugin module');
  }
  return mod as Record<string, unknown>;
}

async function createEnv(config?: Config): Promise<{ hooks: Hooks[]; tool: Tool }> {
  const mod = await importIndexModule();
  const input = createPluginInput();
  const hooks: Hooks[] = [];

  for (const [name, value] of Object.entries(mod)) {
    if (typeof value !== 'function') {
      throw new Error(`Invalid plugin export "${name}"`);
    }
    hooks.push(await (value as Plugin)(input));
  }

  if (config) {
    for (const hook of hooks) {
      const configHook = (hook as Record<string, unknown>).config;
      if (typeof configHook === 'function') {
        await (configHook as (c: Config) => Promise<unknown>)(config);
      }
    }
  }

  const tool = findTool(hooks, 'websearch_grounded');
  if (!tool) {
    throw new Error('Tool "websearch_grounded" not registered');
  }

  return { hooks, tool };
}

function findAuthHook(hooks: Hooks[], providerID: string): Hooks | undefined {
  for (const hook of hooks) {
    const auth = (hook as Record<string, unknown>).auth;
    if (!auth || typeof auth !== 'object') {
      continue;
    }
    if ((auth as Record<string, unknown>).provider === providerID) {
      return hook;
    }
  }
  return undefined;
}

async function invokeAuthLoader(
  hooks: Hooks[],
  providerID: string,
  auth: ProviderAuth
): Promise<void> {
  const hook = findAuthHook(hooks, providerID);
  const authRecord = (hook as Record<string, unknown> | undefined)?.auth;
  const loader = (authRecord as Record<string, unknown> | undefined)?.loader;
  if (typeof loader !== 'function') {
    return;
  }

  await (loader as (g: () => Promise<ProviderAuth>, p: Provider) => Promise<unknown>)(
    () => Promise.resolve(auth),
    {} as Provider
  );
}

function findTool(hooks: Hooks[], name: string): Tool | undefined {
  let found: unknown;
  for (const hook of hooks) {
    const tool = (hook as Record<string, unknown>).tool;
    if (!tool || typeof tool !== 'object') {
      continue;
    }

    const candidate = (tool as Record<string, unknown>)[name];
    if (!candidate) {
      continue;
    }

    if (found) {
      throw new Error(`Tool "${name}" registered multiple times`);
    }

    found = candidate;
  }

  if (!isTool(found)) {
    return undefined;
  }

  return found;
}

function createResponse(candidate: CandidateInput): GeminiGenerateContentResponse {
  return {
    candidates: [candidate],
  };
}

function createFetchResponse(
  body: unknown,
  init?: Partial<Pick<Response, 'ok' | 'status' | 'statusText'>>
): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function createOpenAIResponseBody(text: string): unknown {
  return {
    output: [
      {
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: {
              value: text,
            },
          },
        ],
      },
    ],
  };
}

function createToolContext() {
  const controller = new AbortController();
  return {
    sessionID: 'session',
    messageID: 'message',
    agent: 'agent',
    abort: controller.signal,
  };
}
