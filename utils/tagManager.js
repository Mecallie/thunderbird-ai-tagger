// utils/tagManager.js - Helpers to keep Thunderbird's tag system in sync with our definitions

export async function lookupTagKeyByName(tagName) {
  if (!browser.messages?.tags?.list) return null;
  try {
    const tags = await browser.messages.tags.list();
    const found = tags.find(t => t.tag === tagName);
    return found?.key || null;
  } catch (e) {
    console.warn("Could not list tags:", e);
    return null;
  }
}

export async function ensureTagExists(tagName, color = "#64748b") {
  try {
    const key = await browser.messages.tags.create(null, tagName, color);
    return key;
  } catch (e) {
    const existingKey = await lookupTagKeyByName(tagName);
    if (existingKey) return existingKey;
    console.warn("Could not create tag (may already exist):", tagName, e);
    return null;
  }
}

export async function syncAllTagsToThunderbird(tagsArray) {
  for (const tag of tagsArray) {
    if (tag.name) {
      const key = await ensureTagExists(tag.name, tag.color || "#64748b");
      if (key) tag.key = key;
    }
  }
}