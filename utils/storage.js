// utils/storage.js - Centralized storage helpers with defaults
// All config lives in browser.storage.local for simplicity and reliability.

const DEFAULT_SETTINGS = {
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaModel: "llama3.1:8b",           // Change to whatever the user has pulled
  processedTagName: "🤖 AI-Processed",
  autoProcessEnabled: true,
  scopedAccountIds: [],                 // Empty = process all accounts
  maxBodyChars: 6000,                   // Truncate long emails for efficiency
  temperature: 0.1,
};

const DEFAULT_TAGS = []; // User will create their own via Options

const DEFAULT_ACTIONS = [];

/**
 * Ensure all default keys exist in storage.
 */
export async function ensureDefaults() {
  const data = await browser.storage.local.get([
    "settings",
    "tags",
    "actions",
    "classificationCache",
  ]);

  if (!data.settings) {
    await browser.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  if (!data.tags) {
    await browser.storage.local.set({ tags: DEFAULT_TAGS });
  }
  if (!data.actions) {
    await browser.storage.local.set({ actions: DEFAULT_ACTIONS });
  }
  if (!data.classificationCache) {
    await browser.storage.local.set({ classificationCache: {} });
  }
}

export async function getSettings() {
  const data = await browser.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
}

export async function saveSettings(newSettings) {
  const current = await getSettings();
  const merged = { ...current, ...newSettings };
  await browser.storage.local.set({ settings: merged });
  return merged;
}

export async function getTags() {
  const data = await browser.storage.local.get("tags");
  return data.tags || [];
}

export async function saveTags(tagsArray) {
  await browser.storage.local.set({ tags: tagsArray });
  return tagsArray;
}

export async function getActions() {
  const data = await browser.storage.local.get("actions");
  return data.actions || [];
}

export async function saveActions(actionsArray) {
  await browser.storage.local.set({ actions: actionsArray });
  return actionsArray;
}

// Simple cache helpers (optional - can be expanded later)
export async function getCachedClassification(messageId) {
  const data = await browser.storage.local.get("classificationCache");
  return data.classificationCache?.[messageId] || null;
}

export async function cacheClassification(messageId, result) {
  const data = await browser.storage.local.get("classificationCache");
  const cache = data.classificationCache || {};
  cache[messageId] = { ...result, timestamp: Date.now() };
  await browser.storage.local.set({ classificationCache: cache });
}
