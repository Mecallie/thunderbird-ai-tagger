// utils/ollama.js - Ollama integration (primary LLM)
// Clean, focused on one efficient call per email.
// Designed so a cloud provider module can later replace or wrap this.

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_FETCH_TIMEOUT_MS = 120000;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Main classification function - ONE LLM call for all tags.
 * @param {Object} emailContent - { subject, from, date, body }
 * @param {Array} activeTags - array of tag objects {name, description, priority}
 * @param {Object} settings - { ollamaUrl, ollamaModel, temperature, ... }
 */
export async function classifyEmail(emailContent, activeTags, settings) {
  const ollamaUrl = settings.ollamaUrl || DEFAULT_OLLAMA_URL;
  const model = settings.ollamaModel || "llama3.1:8b";
  const temperature = settings.temperature ?? 0.1;

  const prompt = buildClassificationPrompt(emailContent, activeTags);

  const payload = {
    model: model,
    messages: [
      {
        role: "system",
        content: "You are an expert email classifier. Analyze the email and decide which of the provided tags apply. Be precise and conservative — only tag when the description clearly matches. Always return valid JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    stream: false,
    format: "json",           // Ollama supports this for many models → forces JSON
    options: {
      temperature: temperature,
      num_predict: 512,       // Enough for JSON + reasons
    },
  };

  try {
    const response = await fetchWithTimeout(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const rawContent = data.message?.content || data.response || "";

    return parseLLMResponse(rawContent, activeTags);
  } catch (error) {
    console.error("[Ollama] Classification failed:", error);
    throw new Error(`Ollama classification failed: ${error.message}`);
  }
}

/**
 * Build the user prompt with all tag descriptions + email content.
 * This is the key to one-call efficiency.
 */
function buildClassificationPrompt(emailContent, activeTags) {
  let tagSection = "AVAILABLE TAGS (with natural language descriptions):\n\n";

  // Sort by priority desc so higher priority appear first in prompt (helps LLM)
  const sortedTags = [...activeTags].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  sortedTags.forEach((tag, index) => {
    tagSection += `${index + 1}. **${tag.name}** (priority: ${tag.priority || 0})\n`;
    tagSection += `   Description: ${tag.description}\n`;
    if (tag.keywords && tag.keywords.trim()) {
      tagSection += `   Keywords: ${tag.keywords}\n`;
    }
    tagSection += `\n`;
  });

  const emailSection = `
EMAIL TO CLASSIFY:
Subject: ${emailContent.subject || "(no subject)"}
From: ${emailContent.from || "(unknown)"}
Date: ${emailContent.date || ""}
Body:
${emailContent.body || "(no body)"}
`.trim();

  return `${tagSection}
${emailSection}

INSTRUCTIONS:
You are a precise email tagger optimized for Mistral 8B. Decide which tags apply using both the tag name and its description (and keywords if present).

Strong guidance:
- The tag **name** is a very strong signal. A tag called "Appointment" should match meeting requests, calendar invites, scheduling emails, etc.
- Keywords (if provided) are also strong indicators.
- Only match if the email content reasonably aligns with the name, description, or keywords.
- Do not invent new tags.
- You may select multiple tags.

Return ONLY valid JSON in this exact format:

{
  "matched_tags": ["TagName1", "TagName2"],
  "primary_tag": "TagName1",
  "reasons": {
    "TagName1": "Why it matches (name/description/keywords)",
    "TagName2": "Why it matches"
  }
}

If no tags apply, use empty arrays and null for primary_tag.
`;
}

/**
 * Robust parser for LLM output.
 * Tries JSON first (thanks to format:json), then falls back to extraction.
 */
function parseLLMResponse(rawContent, activeTags) {
  let parsed = null;

  // 1. Try direct JSON parse (best case with format:json)
  try {
    // Sometimes Ollama wraps it or adds extra
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = JSON.parse(rawContent);
    }
  } catch (e) {
    console.warn("[Ollama] Direct JSON parse failed, trying fallback...", e.message);
  }

  if (!parsed || typeof parsed !== "object") {
    // 2. Fallback: simple regex extraction (less reliable but better than nothing)
    parsed = fallbackParse(rawContent);
  }

  // Normalize and validate against known tags
  const knownNames = new Set(activeTags.map(t => t.name));
  const matched = (parsed.matched_tags || parsed.matchedTags || [])
    .filter(name => knownNames.has(name));

  let primary = parsed.primary_tag || parsed.primaryTag || null;
  if (primary && !knownNames.has(primary)) primary = null;

  // If no primary but we have matches, pick highest priority one
  if (!primary && matched.length > 0) {
    const matchedDefs = activeTags.filter(t => matched.includes(t.name));
    matchedDefs.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    primary = matchedDefs[0]?.name || null;
  }

  return {
    matched_tags: matched,
    primary_tag: primary,
    reasons: parsed.reasons || {},
    raw: rawContent, // for debugging in test mode
  };
}

function fallbackParse(text) {
  // Very basic fallback — looks for matched_tags and primary_tag
  const matchedMatch = text.match(/"matched_tags"\s*:\s*\[(.*?)\]/s);
  const primaryMatch = text.match(/"primary_tag"\s*:\s*"([^"]+)"/);

  let matched = [];
  if (matchedMatch) {
    matched = matchedMatch[1]
      .split(",")
      .map(s => s.trim().replace(/"/g, ""))
      .filter(Boolean);
  }

  return {
    matched_tags: matched,
    primary_tag: primaryMatch ? primaryMatch[1] : null,
    reasons: {},
  };
}

/**
 * Test helper used by Options page
 */
export async function testClassification(sampleEmail, tags) {
  let fakeEmail;
  if (typeof sampleEmail === 'object' && sampleEmail !== null) {
    fakeEmail = {
      subject: sampleEmail.subject || "Sample Email",
      from: "test@example.com",
      date: new Date().toISOString(),
      body: sampleEmail.body || sampleEmail,
    };
  } else {
    // Fallback for old string input
    fakeEmail = {
      subject: "Sample Email",
      from: "test@example.com",
      date: new Date().toISOString(),
      body: sampleEmail || "",
    };
  }

  const settings = await (await import('./storage.js')).getSettings();
  return classifyEmail(fakeEmail, tags, settings);
}
