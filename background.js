// background.js - Core orchestration for AI Tagger WebExtension
// Listens for new mail, handles manual classification requests,
// coordinates LLM calls, tag application, and actions.

import * as storage from './utils/storage.js';
import * as ollama from './utils/ollama.js';
import * as emailUtils from './utils/email.js';
import * as tagManager from './utils/tagManager.js';
import * as actionEngine from './utils/actionEngine.js';
import * as folderUtils from './utils/folders.js';

const DEFAULT_PROCESSED_TAG = "🤖 AI-Processed";

// ============================================
// INITIALIZATION
// ============================================
async function initialize() {
  console.log("[AI Tagger] Background script starting...");

  await storage.ensureDefaults();
  await ensureProcessedTagExists();

  setupListeners();

  console.log("[AI Tagger] Ready. Ollama-first design active.");
}

async function ensureProcessedTagExists() {
  const settings = await storage.getSettings();
  const tagName = settings.processedTagName || DEFAULT_PROCESSED_TAG;

  if (settings.processedTagKey) {
    return settings.processedTagKey;
  }

  const key = await tagManager.ensureTagExists(tagName, "#6366f1");
  if (key) {
    await storage.saveSettings({ processedTagKey: key });
    console.log(`[AI Tagger] Processed marker tag key: ${key}`);
    return key;
  }

  return null;
}

async function getProcessedTagKey(settings) {
  if (settings.processedTagKey) return settings.processedTagKey;
  return ensureProcessedTagExists();
}

function isMessageProcessed(header, processedTagKey) {
  return Boolean(
    processedTagKey &&
    header.tags &&
    header.tags.includes(processedTagKey)
  );
}

async function mergeMessageTags(messageId, tagKeysToAdd) {
  const header = await browser.messages.get(messageId);
  const currentTags = header.tags || [];
  const merged = [...new Set([...currentTags, ...tagKeysToAdd.filter(Boolean)])];
  await browser.messages.update(messageId, { tags: merged });
  return merged;
}

function setupListeners() {
  if (browser.messages && browser.messages.onNewMailReceived) {
    browser.messages.onNewMailReceived.addListener(async (folder, messageList) => {
      const settings = await storage.getSettings();
      if (!settings.autoProcessEnabled) return;

      if (settings.scopedAccountIds && settings.scopedAccountIds.length > 0) {
        if (!settings.scopedAccountIds.includes(folder.accountId)) return;
      }

      console.log(`[AI Tagger] New mail received in ${folder.name} (${messageList.messages.length} messages)`);

      for (const msgHeader of messageList.messages) {
        processMessage(msgHeader.id).catch(err => {
          console.error(`[AI Tagger] Error processing message ${msgHeader.id}:`, err);
        });
      }
    });
  } else {
    console.warn("[AI Tagger] onNewMailReceived not available in this Thunderbird version.");
  }

  browser.action.onClicked.addListener(async () => {
    browser.runtime.openOptionsPage();
  });

  if (browser.menus) {
    setupContextMenu().catch(err => {
      console.warn("[AI Tagger] Context menu setup failed:", err);
    });

    browser.menus.onClicked.addListener(async (info) => {
      if (info.menuItemId === "ai-tagger-run-now") {
        try {
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

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "ping") {
      sendResponse({ success: true, status: "ready" });
      return false;
    }

    if (message.type === "listFolders") {
      folderUtils.listSelectableFolders()
        .then(folders => sendResponse({ success: true, folders }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === "classifyMessage") {
      processMessage(message.messageId, { force: message.force || false })
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === "classifyFolder") {
      classifyFolder(message.folderId, message.options || {})
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === "classifyAllUnprocessed") {
      classifyAllUnprocessed(message.options || {})
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

async function setupContextMenu() {
  try {
    await browser.menus.remove("ai-tagger-run-now");
  } catch (_) {}

  await browser.menus.create({
    id: "ai-tagger-run-now",
    title: "AI Tagger: Run classification now",
    contexts: ["message_list", "message_display_action"],
  });
}

// ============================================
// MAIN CLASSIFICATION LOGIC
// ============================================
export async function processMessage(messageId, options = {}) {
  const { force = false } = options;
  let settings = await storage.getSettings();
  const processedTagKey = await getProcessedTagKey(settings);

  try {
    const header = await browser.messages.get(messageId);
    if (!header) {
      console.warn(`[AI Tagger] Message ${messageId} not found`);
      return { skipped: true, reason: "not_found" };
    }

    if (isMessageProcessed(header, processedTagKey) && !force) {
      console.log(`[AI Tagger] Skipping already processed message: ${header.subject}`);
      return { skipped: true, reason: "already_processed" };
    }

    const emailContent = await emailUtils.getMessageContent(messageId, settings.maxBodyChars || 6000);
    if (!emailContent || !emailContent.body) {
      console.warn("[AI Tagger] No body content, skipping LLM call");
      await markAsProcessed(messageId, processedTagKey);
      return { skipped: true, reason: "no_content" };
    }

    const allTags = await storage.getTags();
    const activeTags = allTags.filter(t => t.enabled);

    if (activeTags.length === 0) {
      console.log("[AI Tagger] No active tags defined. Marking as processed only.");
      await markAsProcessed(messageId, processedTagKey);
      return { skipped: true, reason: "no_active_tags" };
    }

    console.log(`[AI Tagger] Classifying "${header.subject}" with ${activeTags.length} tags via Ollama...`);
    const llmResult = await ollama.classifyEmail(emailContent, activeTags, settings);

    const finalTagNames = applyPriorityAndStopLogic(llmResult.matched_tags || [], allTags, llmResult.primary_tag);

    const tagKeyMap = new Map(allTags.map(t => [t.name, t.key || t.name]));
    const finalTagKeys = finalTagNames.map(name => tagKeyMap.get(name) || name);
    const tagsToApply = [...finalTagKeys];
    if (processedTagKey) tagsToApply.push(processedTagKey);

    console.log(`[AI Tagger] Attempting to apply tags to message ${messageId}:`, tagsToApply);

    try {
      await mergeMessageTags(messageId, tagsToApply);
      console.log(`[AI Tagger] Successfully applied tags to message ${messageId}: ${finalTagNames.join(", ")}`);
    } catch (updateError) {
      console.error(`[AI Tagger] Failed to apply tags to message ${messageId}:`, updateError);
      await markAsProcessed(messageId, processedTagKey);
      throw updateError;
    }

    const executedActions = await actionEngine.evaluateAndExecute(messageId, finalTagNames, settings);

    console.log(`[AI Tagger] Successfully tagged message ${messageId} with: ${finalTagNames.join(", ")} (primary: ${llmResult.primary_tag || finalTagNames[0] || "none"})`);

    return {
      success: true,
      matchedTags: finalTagNames,
      primaryTag: llmResult.primary_tag,
      reasons: llmResult.reasons,
      actionsExecuted: executedActions,
    };

  } catch (error) {
    console.error(`[AI Tagger] Failed to process message ${messageId}:`, error);
    try {
      await markAsProcessed(messageId, processedTagKey);
    } catch (_) {}
    throw error;
  }
}

async function markAsProcessed(messageId, processedTagKey) {
  if (!processedTagKey) return;
  try {
    await mergeMessageTags(messageId, [processedTagKey]);
  } catch (e) {
    console.warn("Could not mark as processed:", e);
  }
}

function applyPriorityAndStopLogic(matchedTagNames, allTagDefs, llmPrimary) {
  if (!matchedTagNames || matchedTagNames.length === 0) return [];

  const matchedDefs = matchedTagNames
    .map(name => allTagDefs.find(t => t.name === name))
    .filter(Boolean);

  matchedDefs.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const final = [];
  let stopAfterThis = false;

  for (const tagDef of matchedDefs) {
    final.push(tagDef.name);

    if (tagDef.stopProcessing) {
      stopAfterThis = true;
    }

    if (stopAfterThis) {
      break;
    }
  }

  if (llmPrimary && !final.includes(llmPrimary)) {
    final.unshift(llmPrimary);
  }

  return final;
}

// ============================================
// BULK / MANUAL CLASSIFICATION
// ============================================
export async function classifyFolder(folderId, options = {}) {
  const { limit = 50, onlyUnprocessed = true } = options;
  const settings = await storage.getSettings();
  const processedTagKey = await getProcessedTagKey(settings);

  console.log(`[AI Tagger] Starting folder classification for ${folderId}`);

  const messageList = await browser.messages.list(folderId);
  let processedCount = 0;
  let skippedCount = 0;

  for (const msg of messageList.messages.slice(0, limit)) {
    const header = await browser.messages.get(msg.id);
    if (onlyUnprocessed && isMessageProcessed(header, processedTagKey)) {
      skippedCount++;
      continue;
    }

    try {
      await processMessage(msg.id, { force: !onlyUnprocessed });
      processedCount++;
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error("Batch error on message", msg.id, e);
    }
  }

  return { processed: processedCount, skipped: skippedCount };
}

export async function classifyAllUnprocessed(options = {}) {
  const { limitPerFolder = 25 } = options;
  const accounts = await browser.accounts.list();
  let totalProcessed = 0;
  let totalSkipped = 0;
  const folderResults = [];

  for (const account of accounts) {
    let folders = [];
    try {
      const rootId = account.rootFolder?.id;
      if (!rootId) continue;
      folders = await browser.folders.getSubFolders(rootId, true);
    } catch (e) {
      console.warn(`[AI Tagger] Could not list folders for account ${account.name}:`, e);
      continue;
    }

    for (const folder of folders) {
      if (!folder.id) continue;
      try {
        const result = await classifyFolder(folder.id, {
          limit: limitPerFolder,
          onlyUnprocessed: true,
        });
        totalProcessed += result.processed;
        totalSkipped += result.skipped;
        if (result.processed > 0) {
          folderResults.push({ folder: folder.name, ...result });
        }
      } catch (e) {
        console.error(`[AI Tagger] Error classifying folder ${folder.name}:`, e);
      }
    }
  }

  return { processed: totalProcessed, skipped: totalSkipped, folders: folderResults };
}

initialize().catch(console.error);