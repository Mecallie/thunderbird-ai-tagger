# Thunderbird/Betterbird AI Tagger

**Current version:** 0.1.1

AI-powered WebExtension for automatic and manual email classification & tagging using local Ollama (primary) with clean architecture for future cloud LLM support.

## Project Goal
Reduce manual email organization by letting users define tags in natural language. The LLM classifies each email against all active tags in **one efficient call**, applies matching tags (with one designated as primary), executes configurable actions (move, etc.), and marks the email as processed.

## High-Level Architecture

### Core Principles (v1)
- **One LLM call per email** — All active tag descriptions are sent together. LLM performs multi-label classification + picks primary tag.
- **Local-first** — Optimized for Ollama (`/api/chat` recommended for structured output).
- **Standard WebExtension only** — No Experiments. Uses `browser.messages.*` APIs.
- **Processed state** — Special tag `🤖 AI-Processed` (configurable) + check on MessageHeader.tags.
- **Priority + Stop Processing** — Tags have priority (higher = more important). Stop flag used in post-processing: apply higher-priority matched tags first; if a stop tag matches, skip lower-priority ones after it.
- **Actions are rule-based** — Separate from tags. After tagging, evaluate simple AND conditions on the resulting tag set and execute actions (move/copy/archive/delete/mark read, etc.).
- **Efficient & cache-friendly** — Skip already-processed emails. Body truncated intelligently. Background processing.

### Data Flow (Automatic on New Mail)
1. `browser.messages.onNewMailReceived` fires.
2. For each message:
   - Get full MessageHeader (check if already has "AI-Processed" tag → skip).
   - Extract clean plain-text content (subject, from, date, body).
   - Load enabled tags from storage.
   - Build structured prompt (system + tag list with descriptions/priorities + email content).
   - Call Ollama → expect reliable JSON: `{ matched_tags: string[], primary_tag: string, reasons?: object }`.
   - Parse (robust: JSON first, fallback heuristics).
   - Post-process:
     - Sort matched by priority desc.
     - Apply tags in order; respect stopProcessing (stop applying lower ones after a stop tag).
     - Designate primary (from LLM or highest priority).
   - Apply all final tags + the processed marker tag via `browser.messages.update()`.
   - Evaluate action rules against the final tag set → execute (move, etc.).
3. Done. User sees tags immediately.

### Manual / Bulk Mode
- From Options page: "Run on selected", "Run on current folder", "Run on all unprocessed".
- Re-uses the same `classifyMessage(messageId)` function.
- Batch with small delays to be nice to local LLM.

### Storage Schema (browser.storage.local)
```js
{
  tags: [                          // User-defined classification tags
    {
      id: "uuid-or-timestamp",
      name: "Work",
      description: "Professional work-related emails, projects, deadlines, colleagues...",
      priority: 10,
      enabled: true,
      stopProcessing: false,
      color: "#4ade80"             // Optional, for future Thunderbird tag sync
    },
    ...
  ],
  actions: [                       // Rules executed after tagging
    {
      id: "...",
      name: "Move invoices to Finance",
      condition: { allTags: ["Invoice", "Finance"] },  // AND for v1
      action: { type: "move", target: "folderId-or-path" } // or "archive", "delete", "markRead", etc.
    }
  ],
  settings: {
    ollamaUrl: "http://127.0.0.1:11434",
    ollamaModel: "llama3.1:8b",
    processedTagName: "🤖 AI-Processed",
    autoProcessEnabled: true,
    scopedAccountIds: [],          // empty = all
    maxBodyChars: 6000,
    temperature: 0.1
  },
  // Optional lightweight cache for recent classifications (messageId → summary)
  classificationCache: {}
}
```

### LLM Prompt Strategy (One Call, Multi-Tag)
System prompt explains the task, output format (strict JSON), and how to use descriptions + priorities.
User message: List of active tags (name + description + priority) + email headers + truncated body.
LLM returns JSON only → easy to parse.

This keeps it efficient even with 20+ tags.

### Main Components / Files
- `manifest.json` — Permissions, background, options_ui.
- `background.js` — Event listeners (new mail, toolbar), orchestration of classification, Ollama calls (via utils), apply logic, action engine.
- `options.html` + `options.js` — Full settings UI (Tags CRUD, Actions CRUD, Test classifier, Ollama status, Run manual jobs).
- `utils/`
  - `storage.js` — Typed get/set helpers + defaults.
  - `ollama.js` — `classifyWithOllama(emailContent, tags, settings)` + prompt builder + robust parser.
  - `email.js` — `getMessageContent(messageId)`, extract plain text, truncate.
  - `tagManager.js` — CRUD tags, ensure Thunderbird tags exist via `browser.messages.tags.create()`.
  - `actionEngine.js` — Evaluate rules, execute actions (move, etc.).
- `icons/` — Placeholder icons (replace with real ones later).

### Why This Architecture Works Well
- Clean separation → easy for AI (Grok) to generate and iterate one module at a time.
- Ollama priority: Simple fetch, no extra deps.
- Future cloud: Swap `ollama.js` with a provider abstraction (OpenAI-compatible) without touching core flow.
- One LLM call: Achieved by sending all tag descriptions in a single well-crafted prompt.
- Thunderbird/Betterbird compatible: Uses only standard documented MailExtension APIs.

## Development Workflow
1. Load as **Temporary Add-on** via Thunderbird Add-ons → ⚙ → Debug Add-ons → Load Temporary Add-on (select manifest.json).
2. Use `web-ext` CLI for lint/build if desired: `web-ext build`.
3. Options page opens in tab for configuration.
4. Test with real emails or the built-in tester in Options.

## Current Status (Scaffold)
This is the initial project skeleton created with Grok. We will build it step-by-step:
- Manifest + basic structure done.
- Next: Define storage defaults + implement Ollama client + prompt.
- Then background orchestration.
- Then Options UI.
- Then tag/action engines.
- Polish, error handling, batch processing, testing.

Let's continue iteratively. Tell me what to implement or refine first!

## License
MIT (or your choice)
