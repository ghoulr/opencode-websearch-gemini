# opencode-gemini-search

Gemini Web Search plugin for [OpenCode](https://opencode.ai), inspired by [Gemini CLI](https://github.com/google-gemini/gemini-cli).

This plugin exposes a Gemini-backed web search capability as an OpenCode custom tool, so your agent can call a single tool to perform google grounded web search.

---

## Features

- `geminisearch` tool backed by Google Gemini web search.
- Uses the official `@google/genai` SDK under the hood.
- Outputs exact result with format of Gemini CLI.

For more details, see the design spec in `docs/spec.md`.

---

## How it works

- The plugin registers a custom tool named `geminisearch` with OpenCode.
- When an agent calls this tool with a `query`, the plugin:
  - Reads a Gemini API key from the environment (for example `GEMINI_API_KEY`).
  - Uses `@google/genai` to call a Gemini model configured with the `googleSearch` tool.
  - Takes the returned answer text and grounding metadata.
  - Inserts citation markers into the text and builds a sources list.
  - Returns a markdown-formatted answer plus a structured `sources` array.

This mirrors the behavior of the Gemini CLI `WebSearchTool`, but packaged as a reusable OpenCode plugin.

From a user perspective:

- You ask your OpenCode agent a question that needs web context.
- The agent decides to call `geminisearch` with your natural-language query.
- Gemini performs a web search and returns an answer with inline citations and a numbered "Sources" list at the bottom.

---

## Installation

After installing the plugin from npm, enable it in your `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-gemini-search"],
}
```

As long as the plugin is enabled and the Gemini API key is configured, any OpenCode agent that can use tools will be able to call `geminisearch` when it needs web search.

---

## Gemini API key

Both OpenCode and this plugin are designed to share the same Gemini API key via an environment variable.

1. Set a Gemini API key in your shell, for example:

   ```bash
   export GEMINI_API_KEY="your-gemini-api-key"
   ```

2. In your OpenCode config, you can configure the Gemini provider to also read from the same environment variable (optional, only needed if you want to use Gemini as a model in OpenCode):

   ```jsonc
   {
     "$schema": "https://opencode.ai/config.json",
     "provider": {
       "gemini": {
         "options": {
           "apiKey": "{env:GEMINI_API_KEY}",
         },
         "models": {
           "gemini-2.5-flash": {},
         },
       },
     },
   }
   ```

The plugin will read `GEMINI_API_KEY` directly via the runtime environment.

If no API key is set or the Gemini API call fails, `geminisearch` returns a clear, human-readable error message instead of silently failing.

---

## Development

This repository uses Bun and TypeScript.

```bash
# Install dependencies
bun install

# Run tests after any change
bun test
```

When testing the plugin against a globally installed `opencode` CLI during development, you can point OpenCode at a local checkout using a `file://` URL in your `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///absolute/path/to/opencode-gemini-search/index.ts"],
}
```

Contributions and feedback are welcome.
