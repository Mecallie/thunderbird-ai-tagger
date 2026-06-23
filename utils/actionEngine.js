// utils/actionEngine.js - Evaluate and execute post-classification actions
// v1: Basic structure. Full rule engine can be expanded later.

export async function evaluateAndExecute(messageId, finalTagNames, settings) {
  const actions = await (await import('./storage.js')).getActions(); // or pass in
  if (!actions || actions.length === 0) return [];

  const executed = [];

  for (const rule of actions) {
    if (!rule.condition || !rule.action) continue;

    // Simple AND condition check for v1
    const conditionMet = (rule.condition.allTags || []).every(tag => finalTagNames.includes(tag));

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
      await browser.messages.delete([messageId], { deletePermanently: action.permanent || false });
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
