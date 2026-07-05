// utils/actionEngine.js - Evaluate and execute post-classification actions

export async function evaluateAndExecute(messageId, finalTagNames, settings) {
  const actions = await (await import('./storage.js')).getActions();
  if (!actions || actions.length === 0) return [];

  const executed = [];

  for (const rule of actions) {
    if (!rule.condition || !rule.action || rule.enabled === false) continue;

    const conditionMet = evaluateCondition(rule.condition, finalTagNames);

    if (conditionMet) {
      try {
        await executeAction(messageId, rule.action);
        executed.push(rule.name || rule.action.type);
      } catch (e) {
        console.error("Action execution failed:", rule, e);
      }
    }
  }

  return executed;
}

function evaluateCondition(condition, finalTagNames) {
  if (!condition || !condition.tags || condition.tags.length === 0) return false;

  const ruleTags = condition.tags;
  const hasAll = ruleTags.every(tag => finalTagNames.includes(tag));
  const hasAny = ruleTags.some(tag => finalTagNames.includes(tag));

  if (condition.operator === "OR") {
    return hasAny;
  }

  return hasAll;
}

async function findTrashFolderId(messageId) {
  const header = await browser.messages.get(messageId);
  const folder = header.folder;
  if (!folder?.accountId) return null;

  try {
    const trashFolders = await browser.folders.query({
      accountId: folder.accountId,
      specialUse: ["trash"],
    });
    return trashFolders[0]?.id || null;
  } catch (e) {
    console.warn("[AI Tagger] Could not query trash folder:", e);
    return null;
  }
}

async function executeAction(messageId, action) {
  switch (action.type) {
    case "move":
    case "copy":
      if (action.targetFolderId) {
        await browser.messages[action.type]([messageId], action.targetFolderId);
      }
      break;

    case "archive":
      await browser.messages.archive([messageId]);
      break;

    case "moveToTrash":
      try {
        if (typeof browser.messages.delete === "function") {
          await browser.messages.delete([messageId], { deletePermanently: false });
        } else {
          const trashFolderId = await findTrashFolderId(messageId);
          if (trashFolderId) {
            await browser.messages.move([messageId], trashFolderId);
          } else {
            throw new Error("Trash folder not found and messages.delete() unavailable");
          }
        }
      } catch (e) {
        console.error("[AI Tagger] Move to Trash action failed:", e);
        throw e;
      }
      break;

    case "markRead":
      await browser.messages.update(messageId, { read: true });
      break;

    case "markUnread":
      await browser.messages.update(messageId, { read: false });
      break;

    default:
      console.log("Action type not yet implemented:", action.type);
  }
}