// utils/tagManager.js - Helpers to keep Thunderbird's tag system in sync with our definitions
// v1: Basic. We can call create() when user saves new tags in Options.

export async function ensureTagExists(tagName, color = "#64748b") {
  try {
    const existing = await browser.messages.tags.list();
    const match = existing.find(t => t.tag === tagName || t.key === tagName);
    if (match) return match.key || tagName;

    // Create new tag
    const key = await browser.messages.tags.create(null, tagName, color);
    return key;
  } catch (e) {
    console.warn("Could not ensure tag exists:", tagName, e);
    return tagName; // Fall back to using name directly
  }
}

// Call this from Options when saving tags (future enhancement)
export async function syncAllTagsToThunderbird(tagsArray) {
  for (const tag of tagsArray) {
    if (tag.name) {
      await ensureTagExists(tag.name, tag.color);
    }
  }
}
