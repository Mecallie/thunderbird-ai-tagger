// options.js - Logic for the settings page
// Handles tabs, tag CRUD, settings, test classification, and manual runs.

let currentTags = [];
let currentActions = [];

document.addEventListener("DOMContentLoaded", async () => {
  await loadAllData();
  setupTabs();
  renderTags();
  renderActions(); // placeholder for now
  loadSettingsIntoForm();

  // Auto-save on some changes (simple version)
  document.getElementById("ollamaUrl").addEventListener("change", saveSettingsFromForm);
  document.getElementById("ollamaModel").addEventListener("change", saveSettingsFromForm);
  document.getElementById("autoProcessEnabled").addEventListener("change", saveSettingsFromForm);

  // Button listeners (more reliable than inline onclick)
  const addTagBtn = document.getElementById("add-tag-btn");
  if (addTagBtn) addTagBtn.addEventListener("click", addNewTag);

  const saveTagsBtn = document.getElementById("save-tags-btn");
  if (saveTagsBtn) saveTagsBtn.addEventListener("click", saveAllTags);

  // Additional button listeners
  const addActionBtn = document.getElementById("add-action-btn");
  if (addActionBtn) addActionBtn.addEventListener("click", addNewAction);

  const saveActionsBtn = document.getElementById("save-actions-btn");
  if (saveActionsBtn) saveActionsBtn.addEventListener("click", saveAllActions);

  const testOllamaBtn = document.getElementById("test-ollama-btn");
  if (testOllamaBtn) testOllamaBtn.addEventListener("click", testOllamaConnection);

  const runTestBtn = document.getElementById("run-test-btn");
  if (runTestBtn) runTestBtn.addEventListener("click", runTestClassification);

  const runCurrentBtn = document.getElementById("run-current-folder-btn");
  if (runCurrentBtn) runCurrentBtn.addEventListener("click", runOnCurrentFolder);

  const runAllBtn = document.getElementById("run-all-unprocessed-btn");
  if (runAllBtn) runAllBtn.addEventListener("click", runOnAllUnprocessed);
});

// ==================== TABS ====================
function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.style.display = "none");

      tab.classList.add("active");
      const target = document.getElementById(tab.dataset.tab + "-tab");
      if (target) target.style.display = "block";
    });
  });
}

// ==================== DATA LOADING ====================
async function loadAllData() {
  const [tagsData, actionsData] = await Promise.all([
    browser.storage.local.get("tags"),
    browser.storage.local.get("actions"),
  ]);
  currentTags = tagsData.tags || [];
  currentActions = actionsData.actions || [];

  // Tag sync removed as per user request
}

async function loadSettingsIntoForm() {
  const data = await browser.storage.local.get("settings");
  const s = data.settings || {};
  document.getElementById("ollamaUrl").value = s.ollamaUrl || "http://127.0.0.1:11434";
  document.getElementById("ollamaModel").value = s.ollamaModel || "llama3.1:8b";
  document.getElementById("maxBodyChars").value = s.maxBodyChars || 6000;
  document.getElementById("autoProcessEnabled").checked = s.autoProcessEnabled !== false;
  document.getElementById("processedTagName").value = s.processedTagName || "🤖 AI-Processed";
}

async function saveSettingsFromForm() {
  const newSettings = {
    ollamaUrl: document.getElementById("ollamaUrl").value.trim(),
    ollamaModel: document.getElementById("ollamaModel").value.trim(),
    maxBodyChars: parseInt(document.getElementById("maxBodyChars").value) || 6000,
    autoProcessEnabled: document.getElementById("autoProcessEnabled").checked,
    processedTagName: document.getElementById("processedTagName").value.trim() || "🤖 AI-Processed",
  };
  await browser.storage.local.set({ settings: newSettings });
  showStatus("Settings saved", true);
}

// ==================== TAGS UI ====================
function renderTags() {
  const container = document.getElementById("tags-list");
  container.innerHTML = "";

  if (currentTags.length === 0) {
    container.innerHTML = `<p style="color:#64748b;">No tags yet. Add your first classification tag above.</p>`;
    return;
  }

  currentTags.forEach((tag, index) => {
    const row = document.createElement("div");
    row.className = "tag-row";
    const escapedDesc = (tag.description || '').replace(/"/g, '&quot;');

    row.innerHTML = `
      <input type="text" value="${tag.name}" placeholder="Tag name" style="flex:1; max-width:180px;" data-field="name" data-index="${index}">
      <input type="text" value="${escapedDesc}" placeholder="Natural language description..." style="flex:2.5;" data-field="description" data-index="${index}">
      <input type="text" value="${tag.keywords || ''}" placeholder="Keywords (comma separated)" style="flex:1.5;" data-field="keywords" data-index="${index}">
      <input type="number" value="${tag.priority || 0}" style="width:70px;" title="Priority (higher = more important)" data-field="priority" data-index="${index}">
      <label style="display:flex; align-items:center; gap:4px; white-space:nowrap;">
        <input type="checkbox" ${tag.enabled !== false ? "checked" : ""} data-field="enabled" data-index="${index}"> Enabled
      </label>
      <label style="display:flex; align-items:center; gap:4px; white-space:nowrap;">
        <input type="checkbox" ${tag.stopProcessing ? "checked" : ""} data-field="stopProcessing" data-index="${index}"> Stop
      </label>
      <button class="secondary delete-btn" style="padding:4px 10px;" data-index="${index}">×</button>
    `;

    // Live update on input
    row.querySelectorAll("input").forEach(input => {
      input.addEventListener("input", (e) => {
        const i = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        if (field === "enabled" || field === "stopProcessing") {
          currentTags[i][field] = e.target.checked;
        } else if (field === "priority") {
          currentTags[i][field] = parseInt(e.target.value) || 0;
        } else {
          currentTags[i][field] = e.target.value;
        }

        // Also update keywords if present
        if (field === "keywords") {
          currentTags[i].keywords = e.target.value;
        }
      });
    });

    container.appendChild(row);

    // Attach delete listener (avoids CSP inline onclick issues)
    const deleteBtn = row.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const idx = parseInt(deleteBtn.dataset.index);
        if (confirm("Delete this tag?")) {
          currentTags.splice(idx, 1);
          renderTags();
        }
      });
    }
  });
}

function addNewTag() {
  currentTags.push({
    id: Date.now().toString(36),
    name: "New Tag",
    description: "Describe when this tag should apply...",
    keywords: "",
    priority: 0,
    enabled: true,
    stopProcessing: false,
  });
  renderTags();
}

async function saveAllTags() {
  // Clean empty names
  currentTags = currentTags.filter(t => t.name && t.name.trim());

  // Check for duplicate names
  const names = currentTags.map(t => t.name.toLowerCase().trim());
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) {
    alert(`Duplicate tag names detected: ${[...new Set(duplicates)].join(", ")}\n\nPlease fix before saving.`);
    return;
  }

  await browser.storage.local.set({ tags: currentTags });
  showStatus("Tags saved successfully!", true);

  // Try to create tags in Thunderbird (optional - works even if this fails)
  try {
    await (await import('./utils/tagManager.js')).syncAllTagsToThunderbird(currentTags);
    // Only show "synced" message if no error was thrown
    showStatus("Tags saved and synced to Thunderbird!", true);
  } catch (e) {
    console.warn("Tag sync to Thunderbird failed (classification still works):", e);
    // Do not show error to user - internal tags still function
  }
}

function deleteTag(index) {
  if (confirm("Delete this tag?")) {
    currentTags.splice(index, 1);
    renderTags();
  }
}

// Tag import functionality removed as per user request

// ==================== ACTIONS / RULES ====================
function renderActions() {
  const container = document.getElementById("actions-list");
  container.innerHTML = "";

  if (currentActions.length === 0) {
    const empty = document.createElement("p");
    empty.style.color = "#64748b";
    empty.textContent = "No rules yet. Create your first rule below.";
    container.appendChild(empty);
  }

  currentActions.forEach((rule, index) => {
    const div = document.createElement("div");
    div.style.cssText = "border:1px solid #334155; padding:12px; margin-bottom:12px; border-radius:6px;";

    const tags = rule.condition?.tags || [];
    const operator = rule.condition?.operator || "AND";
    const action = rule.action || {};

    let actionText = "";
    if (action.type === "move") actionText = `Move to folder`;
    else if (action.type === "archive") actionText = "Archive";
    else if (action.type === "delete") actionText = "Delete";

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${rule.name || "Unnamed Rule"}</strong>
        <button class="secondary" style="padding:2px 8px;" data-index="${index}">Delete</button>
      </div>
      <small>Condition: <strong>${tags.join(` ${operator} `) || "(none)"}</strong></small><br>
      <small>Action: ${actionText}</small>
    `;

    const delBtn = div.querySelector("button");
    delBtn.addEventListener("click", () => {
      if (confirm("Delete this rule?")) {
        currentActions.splice(index, 1);
        renderActions();
      }
    });

    container.appendChild(div);
  });

  // Rule creation form
  const form = document.createElement("div");
  form.style.cssText = "margin-top:20px; padding:16px; background:#1e2937; border-radius:8px;";
  form.innerHTML = `
    <h4 style="margin-top:0;">Create New Rule</h4>
    
    <input type="text" id="new-rule-name" placeholder="Rule name" style="width:100%; margin-bottom:8px;">
    
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      <input type="text" id="new-rule-tags" placeholder="Tags (comma separated)" style="flex:1;">
      <select id="new-rule-operator" style="width:90px;">
        <option value="AND">AND</option>
        <option value="OR">OR</option>
      </select>
    </div>
    
    <select id="new-rule-action" style="width:100%; margin-bottom:8px;">
      <option value="move">Move to folder</option>
      <option value="archive">Archive</option>
      <option value="delete">Delete</option>
    </select>
    
    <input type="text" id="new-rule-folder-id" placeholder="Folder ID (only for Move)" style="width:100%; margin-bottom:12px;">
    
    <button id="create-rule-btn">Create Rule</button>
  `;

  const createBtn = form.querySelector("#create-rule-btn");
  createBtn.addEventListener("click", createNewRule);

  container.appendChild(form);
}

function createNewRule() {
  const name = document.getElementById("new-rule-name").value.trim();
  const tagsStr = document.getElementById("new-rule-tags").value.trim();
  const operator = document.getElementById("new-rule-operator").value;
  const actionType = document.getElementById("new-rule-action").value;
  const folderId = document.getElementById("new-rule-folder-id").value.trim();

  if (!name || !tagsStr) {
    alert("Please enter a rule name and at least one tag.");
    return;
  }

  const tags = tagsStr.split(",").map(t => t.trim()).filter(Boolean);

  const newRule = {
    id: Date.now().toString(36),
    name: name,
    enabled: true,
    condition: {
      operator: operator,
      tags: tags
    },
    action: {
      type: actionType,
      targetFolderId: actionType === "move" ? folderId : null
    }
  };

  currentActions.push(newRule);
  renderActions();
}

function addNewAction() {
  // Trigger re-render of the form
  renderActions();
}

async function saveAllActions() {
  await browser.storage.local.set({ actions: currentActions });
  showStatus("Rules saved successfully!", true);
}

// ==================== TEST & MANUAL ====================
async function runTestClassification() {
  const subject = document.getElementById("test-subject")?.value.trim() || "Sample Email";
  const body = document.getElementById("test-body").value.trim();
  if (!body) {
    alert("Please paste some email content to test.");
    return;
  }

  const resultDiv = document.getElementById("test-result");
  resultDiv.style.display = "block";
  resultDiv.textContent = "Calling Ollama...";

  try {
    const response = await browser.runtime.sendMessage({
      type: "testClassification",
      sampleEmail: { subject, body },
      tags: currentTags.filter(t => t.enabled),
    });

    if (response.success) {
      resultDiv.textContent = JSON.stringify(response.result, null, 2);
    } else {
      resultDiv.textContent = "Error: " + response.error;
    }
  } catch (e) {
    resultDiv.textContent = "Error: " + e.message;
  }
}

async function testOllamaConnection() {
  const statusEl = document.getElementById("ollama-status");
  statusEl.style.display = "block";
  statusEl.className = "status";
  statusEl.textContent = "Testing connection to Ollama...";

  try {
    const url = document.getElementById("ollamaUrl").value.trim();
    const res = await fetch(`${url}/api/tags`);
    if (res.ok) {
      const data = await res.json();
      const models = data.models?.map(m => m.name).join(", ") || "No models listed";
      statusEl.className = "status success";
      statusEl.textContent = `✅ Connected! Available models: ${models}`;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    statusEl.className = "status error";
    statusEl.textContent = `❌ Connection failed: ${e.message}. Is Ollama running?`;
  }
}

async function runOnCurrentFolder() {
  if (!confirm("Run AI classification on the currently selected folder? This may take time depending on number of emails.")) return;

  try {
    // In a real implementation we would need the current folder ID from a message or mailTab.
    // For v1 scaffold we show how it would work.
    alert("Folder run requires knowing the current folder ID. In full version we will query active mail tab.\n\nFor now, use the background classifyFolder function or implement folder picker.");
    // Example call:
    // const result = await browser.runtime.sendMessage({ type: "classifyFolder", folderId: "someId" });
  } catch (e) {
    alert("Error: " + e.message);
  }
}

async function runOnAllUnprocessed() {
  alert("Bulk run on all accounts will be added. It re-uses the same efficient processMessage function.");
}

// Helper
function showStatus(msg, success = true) {
  const el = document.createElement("div");
  el.className = `status ${success ? "success" : "error"}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// Global for remaining inline onclick (delete buttons) + future use
window.deleteTag = deleteTag;
window.addNewAction = addNewAction; // still used if any leftover
