# AI Tagger for Thunderbird

[![Version](https://img.shields.io/badge/version-0.1.20-blue)](https://github.com/Mecallie/thunderbird-ai-tagger/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Thunderbird](https://img.shields.io/badge/Thunderbird-128%2B-orange)](https://www.thunderbird.net/)

A Thunderbird/Betterbird MailExtension that classifies and tags email using a **local Ollama** LLM. Define tags in plain English; the extension matches incoming mail in a single LLM call, applies Thunderbird tags, runs optional rules (move, archive, trash), and marks messages as processed.

**Privacy-first:** email content is sent only to your local Ollama instance (`localhost`). No cloud API required.

## Features

- **One LLM call per email** — all active tag definitions are evaluated together for efficiency
- **Natural-language tags** — describe when a tag should apply; optional keywords for small models
- **Automatic processing** — classify new mail as it arrives (`onNewMailReceived`)
- **Manual runs** — context menu, folder batch, or all-unprocessed across accounts
- **Action rules** — move, archive, or trash when tag conditions match (AND/OR)
- **Priority & stop processing** — control which tags win when multiple match
- **Processed marker** — skip already-classified messages (configurable tag)
- **Built-in tester** — paste sample email content and inspect JSON results in Options

## Requirements

- [Thunderbird](https://www.thunderbird.net/) or [Betterbird](https://www.betterbird.eu/) **128+**
- [Ollama](https://ollama.com/) running locally with a pulled model (default: `llama3.1:8b`)

## Installation

### From source (development)

```bash
git clone https://github.com/Mecallie/thunderbird-ai-tagger.git
cd thunderbird-ai-tagger
npm install
npm run build
```

Load the built extension in Thunderbird:

1. **Add-ons and Themes** → gear icon → **Debug Add-ons**
2. **Load Temporary Add-on** → select `manifest.json` (or install the zip from `web-ext-artifacts/`)

### From release zip

Download `ai_tagger_for_thunderbird-0.1.20.zip` from [Releases](https://github.com/Mecallie/thunderbird-ai-tagger/releases), then load it as a temporary add-on (or install via your preferred method).

## Quick start

1. Open **AI Tagger** settings (toolbar button or Add-ons → Preferences).
2. Confirm **Ollama URL** and model, then click **Test Ollama Connection**.
3. On the **Tags** tab, add tags with descriptions and click **Save All Tags**.
4. Enable **automatic processing** on the **LLM & Settings** tab, or use **Test & Manual Run** to try a sample email.

## Development

```bash
npm run lint      # web-ext lint
npm run build     # package to web-ext-artifacts/
npm run start     # run with web-ext (Thunderbird target)
```

Background script logs appear in **about:debugging → This Thunderbird → AI Tagger → Inspect**. The options page has its own console.

## Architecture

| File | Role |
|------|------|
| `background.js` | New-mail listener, classification orchestration, bulk runs |
| `options.html` / `options.js` | Settings UI (tags, rules, Ollama config, tester) |
| `utils/ollama.js` | Prompt builder, Ollama `/api/chat`, JSON parsing |
| `utils/email.js` | Extract plain-text body from messages |
| `utils/tagManager.js` | Sync tags with Thunderbird's tag system |
| `utils/actionEngine.js` | Post-classification rules (move, archive, trash) |
| `utils/folders.js` | Folder picker for action rules |
| `utils/storage.js` | `browser.storage.local` helpers |

## License

MIT — see [LICENSE](LICENSE) if present, or MIT as stated in `package.json`.

## Topics

`thunderbird` · `betterbird` · `thunderbird-addon` · `mail-extension` · `webextension` · `ollama` · `llm` · `email-classification` · `ai` · `local-ai` · `email-automation`