# opencode-websearch-gemini

LLM-grounded web search plugin for [OpenCode](https://opencode.ai), inspired by [Gemini CLI](https://github.com/google-gemini/gemini-cli).

This plugin exposes an LLM-grounded web search capability as an OpenCode custom tool, so your agent can call a single tool to perform web search with inline citations.

---

## Features

- `websearch_grounded` tool backed by the configured provider (Google or OpenAI).
- Uses the first `provider.<id>.options.websearch_grounded.model` found in your OpenCode config (provider order matters).
- Outputs LLM-grounded results with inline citations and a `Sources:` list when available.

---

## How it works

- The plugin registers a custom tool named `websearch_grounded` with OpenCode.
- When an agent calls this tool with a `query`, the plugin:
  - Resolves auth by calling the provider auth callback registered by OpenCode.
  - Requires `provider.<id>.options.websearch_grounded.model` to be set in `opencode.json`.
  - Calls the provider web search endpoint and returns the provider response text.

From a user perspective:

- You ask your OpenCode agent a question that needs web context.
- The agent decides to call `websearch_grounded` with your natural-language query.
- The configured provider performs a web search and returns an LLM-grounded answer with inline citations and a numbered `Sources:` list at the bottom when available.

---

## Installation

Add `opencode-websearch-gemini` to your `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-websearch-gemini@0.9.2"]
}
```

OpenCode does not upgrade plugins automatically, so you need to pin the version once the plugin upgraded.

As long as the plugin is enabled and the Gemini API key is configured, any OpenCode agent that can use tools will be able to call `websearch_grounded` when it needs LLM-grounded web search.

---

## Configure web search

1. Authenticate the provider you want to use:

   ```bash
   opencode auth login
   ```

   For `openai`, authenticate using your OpenCode OpenAI setup (API key or OAuth). This plugin only reads the stored credentials.

2. Set a `websearch_grounded` model in your `opencode.json` (required).

   Provider selection rule: the plugin scans `provider` entries in order and uses the first provider that contains `options.websearch_grounded.model`. To select a provider, put it first.

   ```jsonc
   {
     "provider": {
       "openai": {
         "options": {
           "websearch_grounded": {
             "model": "gpt-5.1",
           },
         },
       },
       "google": {
         "options": {
           "websearch_grounded": {
             "model": "gemini-2.5-flash",
           },
         },
       },
     },
   }
   ```

If auth or model config is missing, `websearch_grounded` throws an error and OpenCode will display the message.

---

## Development

This repository uses Bun and TypeScript.

```bash
# Install dependencies
bun install

# Run tests after any change
bun test:agent
```

When testing the plugin against a globally installed `opencode` CLI during development, you can point OpenCode at a local checkout using a `file://` URL in your `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///path/to/opencode-websearch-gemini/index.ts"]
}
```

Contributions and feedback are welcome.
