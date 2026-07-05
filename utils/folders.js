// utils/folders.js - Folder listing helpers for options UI and background tasks

function isSelectableFolder(folder) {
  return Boolean(folder?.id && !folder.isVirtual && !folder.isTag && !folder.isUnified);
}

/**
 * List all user-selectable mail folders across all accounts.
 * Returns entries sorted by account name, then folder path.
 */
export async function listSelectableFolders() {
  const accounts = await browser.accounts.list();
  const results = [];

  for (const account of accounts) {
    let folders = [];
    try {
      folders = await browser.folders.query({ accountId: account.id });
    } catch (e) {
      console.warn(`[AI Tagger] folders.query failed for ${account.name}:`, e);
      const rootId = account.rootFolder?.id;
      if (rootId) {
        folders = await browser.folders.getSubFolders(rootId, true);
      }
    }

    for (const folder of folders) {
      if (!isSelectableFolder(folder)) continue;
      results.push({
        id: folder.id,
        name: folder.name,
        path: folder.path || folder.name,
        accountName: account.name,
        label: `${account.name} / ${folder.path || folder.name}`,
      });
    }
  }

  return results.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Prompt the user to pick a folder from a numbered list.
 * Returns the selected folder entry or null if cancelled.
 */
export async function promptFolderSelection(title = "Select folder number:") {
  const folders = await listSelectableFolders();
  if (!folders.length) {
    throw new Error("No folders found in any account.");
  }

  const list = folders.map((f, i) => `${i + 1}. ${f.label}`).join("\n");
  const choice = prompt(`${title}\n\n${list}`);
  if (choice === null) return null;

  const idx = parseInt(choice, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= folders.length) {
    throw new Error("Invalid folder selection.");
  }

  return folders[idx];
}