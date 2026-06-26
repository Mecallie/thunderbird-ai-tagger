// utils/actionEngine.js - Evaluate and execute post-classification actions
// v1: Basic structure. Full rule engine can be expanded later.

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
  } else {
    // Default to AND
    return hasAll;
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

    case "delete":
      try {
        if (typeof browser.messages.delete === "function") {
          await browser.messages.delete([messageId], { deletePermanently: action.permanent || false });
        } else {
          console.warn("[AI Tagger] browser.messages.delete() is not available in this environment. Delete action skipped.");
        }
      } catch (e) {
        console.error("[AI Tagger] Delete action failed:", e);
      }
      break;

    case "markRead":
      await browser.messages.update(messageId, { read: true });
      break;

    case "markUnread":
      await browser.messages.update(messageId, { read: false });
      break;

    // Future: forward, reply, add/remove extra tags, etc.
    default:
      console.log("Action type not yet implemented:", action.type);
  }
}
