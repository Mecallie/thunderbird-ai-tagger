// background.js - Core orchestration for AI Tagger WebExtension
// Listens for new mail, handles manual classification requests,
// coordinates LLM calls, tag application, and actions.

import * as storage from './utils/storage.js';
import * as ollama from './utils/ollama.js';
import * as emailUtils from './utils/email.js';
import * as tagManager from './utils/tagManager.js';
import * as actionEngine from './utils/actionEngine.js';

// Special tag used to mark emails as already processed by AI
const DEFAULT_PROCESSED_TAG = "🤖 AI-Processed";

// ============================================
// INITIALIZATION
// ============================================
async function initialize() {
  console.log("[AI Tagger] Background script starting...");

  // Ensure default settings and processed tag exist
  await storage.ensureDefaults();
  await ensureProcessedTagExists();

  // Set up listeners
  setupListeners();

  console.log("[AI Tagger] Ready. Ollama-first design active.");
}

async function ensureProcessedTagExists() {
  const settings = await storage.getSettings();
  const tagName = settings.processedTagName || DEFAULT_PROCESSED_TAG;

  try {
    // Check if tag already exists
    const existingTags = await browser.messages.tags.list();
    const exists = existingTags.some(t => t.tag === tagName || t.key === tagName);

    if (!exists) {
      // Create it (key can be auto-generated or we use a clean key)
      await browser.messages.tags.create(null, tagName, "#6366f1"); // Indigo color
      console.log(`[AI Tagger] Created processed marker tag: ${tagName}`);
    }
  } catch (err) {
    console.warn("[AI Tagger] Could not ensure processed tag (may already exist):", err);
  }
}

function setupListeners() {
  // Automatic processing on new mail
  if (browser.messages && browser.messages.onNewMailReceived) {
    browser.messages.onNewMailReceived.addListener(async (folder, messageList) => {
      const settings = await storage.getSettings();
      if (!settings.autoProcessEnabled) return;

      // Optional scoping by account
      if (settings.scopedAccountIds && settings.scopedAccountIds.length > 0) {
        if (!settings.scopedAccountIds.includes(folder.accountId)) return;
      }

      console.log(`[AI Tagger] New mail received in ${folder.name} (${messageList.messages.length} messages)`);

      for (const msgHeader of messageList.messages) {
        // Process asynchronously, don't block other mail
        processMessage(msgHeader.id).catch(err => {
          console.error(`[AI Tagger] Error processing message ${msgHeader.id}:`, err);
        });
      }
    });
  } else {
    console.warn("[AI Tagger] onNewMailReceived not available in this Thunderbird version.");
  }

  // Toolbar button (action) - manual trigger for selected or current view
  browser.action.onClicked.addListener(async (tab) => {
    browser.runtime.openOptionsPage();
  });

  // Context menu: Right-click on message → AI Tagger: Run now
  if (browser.menus) {
    browser.menus.create({
      id: "ai-tagger-run-now",
      title: "AI Tagger: Run classification now",
      contexts: ["message_list", "message_display_action"],
    });

    browser.menus.onClicked.addListener(async (info, tab) => {
      if (info.menuItemId === "ai-tagger-run-now") {
        try {
          // Get selected messages
          const messages = await browser.messages.getSelectedMessages();
          if (messages && messages.messages.length > 0) {
            for (const msg of messages.messages) {
              processMessage(msg.id, { force: true }).catch(err => {
                console.error(`[AI Tagger] Context menu error on message ${msg.id}:`, err);
              });
            }
            console.log(`[AI Tagger] Started classification on ${messages.messages.length} message(s) via context menu`);
          }
        } catch (e) {
          console.error("[AI Tagger] Failed to get selected messages:", e);
        }
      }
    });
  }

  // Listen for messages from options page (manual runs, test, etc.)
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "classifyMessage") {
      processMessage(message.messageId, { force: message.force || false })
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Keep channel open for async
    }

    if (message.type === "classifyFolder") {
      classifyFolder(message.folderId, message.options || {})
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === "testClassification") {
      ollama.testClassification(message.sampleEmail, message.tags)
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
  });
}

// ============================================
// MAIN CLASSIFICATION LOGIC
// ============================================
export async function processMessage(messageId, options = {}) {
  const { force = false } = options;
  const settings = await storage.getSettings();
  const processedTag = settings.processedTagName || DEFAULT_PROCESSED_TAG;

  try {
    // 1. Get message header to check if already processed
    const header = await browser.messages.get(messageId);
    if (!header) {
      console.warn(`[AI Tagger] Message ${messageId} not found`);
      return { skipped: true, reason: "not_found" };
    }

    const alreadyProcessed = header.tags && header.tags.includes(processedTag);
    if (alreadyProcessed && !force) {
      console.log(`[AI Tagger] Skipping already processed message: ${header.subject}`);
      return { skipped: true, reason: "already_processed" };
    }

    // 2. Extract clean email content
    const emailContent = await emailUtils.getMessageContent(messageId, settings.maxBodyChars || 6000);
    if (!emailContent || !emailContent.body) {
      console.warn("[AI Tagger] No body content, skipping LLM call");
      await markAsProcessed(messageId, processedTag);
      return { skipped: true, reason: "no_content" };
    }

    // 3. Load active tags
    const allTags = await storage.getTags();
    const activeTags = allTags.filter(t => t.enabled);

    if (activeTags.length === 0) {
      console.log("[AI Tagger] No active tags defined. Marking as processed only.");
      await markAsProcessed(messageId, processedTag);
      return { skipped: true, reason: "no_active_tags" };
    }

    // 4. Call LLM (one call for all tags)
    console.log(`[AI Tagger] Classifying "${header.subject}" with ${activeTags.length} tags via Ollama...`);
    const llmResult = await ollama.classifyEmail(emailContent, activeTags, settings);

    // 5. Post-process tags (priority + stopProcessing logic)
    const finalTags = applyPriorityAndStopLogic(llmResult.matched_tags || [], allTags, llmResult.primary_tag);

    // 6. Apply tags to the message
    const tagsToApply = [...finalTags, processedTag];
    await browser.messages.update(messageId, {
      tags: tagsToApply,
      // We could also set flagged or other properties here
    });

    // 7. Execute any matching actions
    const executedActions = await actionEngine.evaluateAndExecute(messageId, finalTags, settings);

    console.log(`[AI Tagger] Successfully tagged message ${messageId} with: ${finalTags.join(", ")} (primary: ${llmResult.primary_tag || finalTags[0] || "none"})`);

    return {
      success: true,
      matchedTags: finalTags,
      primaryTag: llmResult.primary_tag,
      reasons: llmResult.reasons,
      actionsExecuted: executedActions,
    };

  } catch (error) {
    console.error(`[AI Tagger] Failed to process message ${messageId}:`, error);
    // Still mark as processed to avoid infinite retries on bad emails
    try {
      await markAsProcessed(messageId, processedTag);
    } catch (_) {}
    throw error;
  }
}

async function markAsProcessed(messageId, processedTag) {
  try {
    const header = await browser.messages.get(messageId);
    const currentTags = header.tags || [];
    if (!currentTags.includes(processedTag)) {
      await browser.messages.update(messageId, {
        tags: [...currentTags, processedTag]
      });
    }
  } catch (e) {
    console.warn("Could not mark as processed:", e);
  }
}

// Apply priority ordering and stopProcessing logic
function applyPriorityAndStopLogic(matchedTagNames, allTagDefs, llmPrimary) {
  if (!matchedTagNames || matchedTagNames.length === 0) return [];

  // Get full tag objects for matched names
  const matchedDefs = matchedTagNames
    .map(name => allTagDefs.find(t => t.name === name))
    .filter(Boolean);

  // Sort by priority descending (higher number = higher priority)
  matchedDefs.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const final = [];
  let stopAfterThis = false;

  for (const tagDef of matchedDefs) {
    final.push(tagDef.name);

    if (tagDef.stopProcessing) {
      stopAfterThis = true;
      // Still include this stop tag
    }

    if (stopAfterThis) {
      break; // Stop adding lower priority tags after a stop tag
    }
  }

  // Ensure primary is included if specified by LLM
  if (llmPrimary && !final.includes(llmPrimary)) {
    final.unshift(llmPrimary); // Put primary first
  }

  return final;
}

// ============================================
// BULK / MANUAL CLASSIFICATION
// ============================================
export async function classifyFolder(folderId, options = {}) {
  const { limit = 50, onlyUnprocessed = true } = options;
  const settings = await storage.getSettings();
  const processedTag = settings.processedTagName || DEFAULT_PROCESSED_TAG;

  console.log(`[AI Tagger] Starting folder classification for ${folderId}`);

  // Query messages in the folder
  let queryInfo = { folderId };
  if (onlyUnprocessed) {
    // Thunderbird query supports tags filter? We may need to list and filter client-side
    // For simplicity in v1: list all and skip processed ones in the loop
  }

  const messageList = await browser.messages.list(folderId);
  let processedCount = 0;
  let skippedCount = 0;

  // Note: For large folders we should use pagination (continueList)
  // This is a simplified version
  for (const msg of messageList.messages.slice(0, limit)) {
    const header = await browser.messages.get(msg.id); // refresh to get current tags
    const isProcessed = header.tags && header.tags.includes(processedTag);

    if (onlyUnprocessed && isProcessed) {
      skippedCount++;
      continue;
    }

    try {
      await processMessage(msg.id, { force: !onlyUnprocessed });
      processedCount++;
      // Small delay to be polite to local Ollama
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error("Batch error on message", msg.id, e);
    }
  }

  return { processed: processedCount, skipped: skippedCount };
}

// Boot the extension
initialize().catch(console.error);
