import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import type { PluginInput } from '@opencode-ai/plugin';
import type { GenerateContentResponse } from '@google/genai';
import type { GeminiSearchResult } from './index';

const mockGenerateContent = vi.fn();
const mockGoogleGenAI = vi.fn(() => ({
  models: {
    generateContent: mockGenerateContent,
  },
}));

void vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: mockGoogleGenAI,
  };
});

const { formatWebSearchResponse, GeminiSearchPlugin } = await import('./index');

describe('formatWebSearchResponse', () => {
  it('returns fallback when Gemini response has no text', () => {
    const response = createResponse({
      content: {
        role: 'model',
        parts: [{ text: '' }],
      },
    });

    const result = formatWebSearchResponse(response, 'no results query');

    expect(result.llmContent).toBe(
      'No search results or information found for query: "no results query"'
    );
    expect(result.returnDisplay).toBe('No information found.');
    expect(result.sources).toBeUndefined();
  });

  it('formats results without sources', () => {
    const response = createResponse({
      content: {
        role: 'model',
        parts: [{ text: 'Here are your results.' }],
      },
    });

    const result = formatWebSearchResponse(response, 'successful query');

    expect(result.llmContent).toBe(
      'Web search results for "successful query":\n\nHere are your results.'
    );
    expect(result.returnDisplay).toBe(
      'Search results for "successful query" returned.'
    );
    expect(result.sources).toBeUndefined();
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

    expect(result.llmContent).toBe(
      'Web search results for "grounding query":\n\nThis is a test[1] response.[1][2]\n\nSources:\n[1] Example Site (https://example.com)\n[2] Google (https://google.com)'
    );
    expect(result.sources).toHaveLength(2);
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

    expect(result.llmContent).toBe(
      'Web search results for "multibyte query":\n\nこんにちは![1] Gemini CLI✨️[2][3]\n\nSources:\n[1] Japanese Greeting (https://example.test/japanese-greeting)\n[2] google-gemini/gemini-cli (https://github.com/google-gemini/gemini-cli)\n[3] Gemini CLI: your open-source AI agent (https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/)'
    );
    expect(result.sources).toHaveLength(3);
  });
});

describe('GeminiSearchPlugin', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockGoogleGenAI.mockClear();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it('returns validation error for empty queries', async () => {
    const plugin = await createPluginHooks();
    const tool = plugin.tool?.geminisearch;
    expect(tool).toBeDefined();
    const context = createToolContext();

    const raw = await tool!.execute({ query: '   ' }, context);
    const result = parseResult(raw);

    expect(result.error?.type).toBe('INVALID_QUERY');
    expect(result.llmContent).toContain('cannot be empty');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('returns configuration error when API key is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    const plugin = await createPluginHooks();
    const tool = plugin.tool?.geminisearch;
    const context = createToolContext();

    const raw = await tool!.execute({ query: 'opencode' }, context);
    const result = parseResult(raw);

    expect(result.error?.type).toBe('MISSING_GEMINI_API_KEY');
    expect(result.llmContent).toContain('Gemini web search is not configured');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('returns successful search results', async () => {
    mockGenerateContent.mockResolvedValue(
      createResponse({
        content: {
          role: 'model',
          parts: [{ text: 'Search body' }],
        },
        groundingMetadata: {
          groundingChunks: [{ web: { title: 'Example', uri: 'https://example.com' } }],
          groundingSupports: [
            {
              segment: { startIndex: 0, endIndex: 6 },
              groundingChunkIndices: [0],
            },
          ],
        },
      })
    );

    const plugin = await createPluginHooks();
    const tool = plugin.tool?.geminisearch;
    const context = createToolContext();

    const raw = await tool!.execute({ query: 'sample' }, context);
    const result = parseResult(raw);

    expect(result.error).toBeUndefined();
    expect(result.llmContent).toContain('Web search results for "sample"');
    expect(result.sources).toBeDefined();
    expect(result.sources?.length).toBe(1);
  });

  it('returns Gemini failure details', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API Failure'));

    const plugin = await createPluginHooks();
    const tool = plugin.tool?.geminisearch;
    const context = createToolContext();

    const raw = await tool!.execute({ query: 'sample' }, context);
    const result = parseResult(raw);

    expect(result.error?.type).toBe('GEMINI_WEB_SEARCH_FAILED');
    expect(result.llmContent).toContain('currently unavailable');
    expect(result.llmContent).toContain('API Failure');
  });

  it('uses provider geminisearch api key when configured', async () => {
    delete process.env.GEMINI_API_KEY;
    mockGenerateContent.mockResolvedValue(
      createResponse({
        content: {
          role: 'model',
          parts: [{ text: 'Config search response' }],
        },
      })
    );

    const plugin = await createPluginHooks({
      provider: {
        geminisearch: {
          options: {
            apiKey: 'config-key',
          },
        },
      },
    });

    const tool = plugin.tool?.geminisearch;
    const context = createToolContext();

    await tool!.execute({ query: 'config query' }, context);

    expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'config-key' });
  });

  it('uses configured model when provided', async () => {
    mockGenerateContent.mockResolvedValue(
      createResponse({
        content: {
          role: 'model',
          parts: [{ text: 'Model search response' }],
        },
      })
    );

    const plugin = await createPluginHooks({
      provider: {
        geminisearch: {
          options: {
            apiKey: 'config-key',
            model: 'gemini-2.5-pro',
          },
        },
      },
    });

    const tool = plugin.tool?.geminisearch;
    const context = createToolContext();

    await tool!.execute({ query: 'custom model query' }, context);

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.5-pro' })
    );
  });
});

type CandidateInput = NonNullable<GenerateContentResponse['candidates']>[number];

function parseResult(raw: string): GeminiSearchResult {
  return JSON.parse(raw) as unknown as GeminiSearchResult;
}

type PluginHooks = Awaited<ReturnType<typeof GeminiSearchPlugin>>;

type PluginConfigInput = PluginHooks extends {
  config?: (input: infer T) => Promise<void>;
}
  ? T
  : never;

async function createPluginHooks(config?: PluginConfigInput) {
  const plugin = await GeminiSearchPlugin({} as PluginInput);
  if (config && plugin.config) {
    await plugin.config(config);
  }
  return plugin;
}

function createResponse(candidate: CandidateInput): GenerateContentResponse {
  return {
    candidates: [candidate],
  } as GenerateContentResponse;
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
