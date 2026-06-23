// utils/tagManager.js - Helpers to keep Thunderbird's tag system in sync with our definitions
// v1: Basic. We can call create() when user saves new tags in Options.

export async function ensureTagExists(tagName, color = "#64748b") {
  try {
    // Modern approach: just try to create. It throws if the tag already exists.
    const key = await browser.messages.tags.create(null, tagName, color);
    return key;
  } catch (e) {
    // Tag probably already exists — this is fine.
    if (e.message && e.message.toLowerCase().includes("already")) {
      return tagName;
    }
    console.warn("Could not create tag (may already exist):", tagName, e);
    return tagName;
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
