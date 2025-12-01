# opencode-gemini-search

Gemini Web Search plugin for [OpenCode](https://opencode.ai).

This plugin exposes a Gemini-backed web search capability as an OpenCode custom tool, so any model you use in OpenCode (Anthropic, OpenAI, Gemini, etc.) can call a single tool to perform real web search and receive a cited, source-backed answer.

---

## Features

- `geminisearch` tool backed by Google Gemini web search.
- Uses the official `@google/genai` SDK under the hood.
- Inserts inline citation markers (`[1]`, `[2]`, ...) into the answer text.
- Appends a "Sources" section listing titles and URLs.
- Model-agnostic on the OpenCode side: any provider/model can invoke the tool.

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

---

## Installation

This project is built with [Bun](https://bun.com).

Install dependencies:

```bash
bun install
```

You can run the plugin entry point locally during development with:

```bash
bun run index.ts
```

The plugin itself is intended to be published as an npm package (for example `opencode-gemini-search`) and then added as a dependency in your OpenCode project.

---

## OpenCode configuration

After publishing and installing the plugin in your project, enable it in your `opencode.jsonc`:

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

If no API key is set, `geminisearch` will return an explicit error instead of silently failing.

---

## Development

This repository uses Bun and TypeScript.

- Package metadata and scripts are in `package.json`.
- Linting and formatting are configured via ESLint and Prettier.
- Husky and lint-staged are set up for pre-commit hooks.

Typical development workflow:

```bash
# Install dependencies
bun install

# Run the plugin entry point (development)
bun run index.ts

# Run lint and format (once scripts are added)
# bun run lint
# bun run format
```

---

## Status

This project is a work in progress and is not yet published to npm. The current focus is on:

- Implementing the `geminisearch` tool behavior as described in `docs/spec.md`.
- Wiring the tool into OpenCode as a plugin.
- Hardening error handling and edge cases around grounding metadata and UTF-8 citation insertion.

Contributions and feedback are welcome once the initial version is published.
