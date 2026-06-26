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

  // Try to create tags in Thunderbird and capture keys
  for (const tag of currentTags) {
    if (!tag.key && browser.messages && browser.messages.tags && typeof browser.messages.tags.create === "function") {
      try {
        const key = await browser.messages.tags.create(null, tag.name, "#64748b");
        tag.key = key;
      } catch (e) {
        // Tag probably already exists or creation failed — we'll fall back to name
        console.warn(`Could not create tag "${tag.name}" to get key:`, e.message);
      }
    }
  }

  await browser.storage.local.set({ tags: currentTags });
  showStatus("Tags saved successfully!", true);
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
  if (!container) return;

  container.innerHTML = "";

  if (currentActions.length === 0) {
    const p = document.createElement("p");
    p.style.color = "#64748b";
    p.textContent = "No rules yet. Create your first rule below.";
    container.appendChild(p);
  }

  // Render existing rules
  currentActions.forEach((rule, index) => {
    const div = document.createElement("div");
    div.style.cssText = "border:1px solid #334155; padding:12px; margin-bottom:12px; border-radius:6px;";

    const tags = rule.condition?.tags || [];
    const operator = rule.condition?.operator || "AND";
    const actionType = rule.action?.type || "";

    let actionText = actionType;
    if (actionType === "move") actionText = "Move to folder";
    else if (actionType === "archive") actionText = "Archive";
    else if (actionType === "moveToTrash") actionText = "Move to Trash";

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${rule.name || "Unnamed Rule"}</strong>
        <button class="secondary" data-action="delete" data-index="${index}">Delete</button>
      </div>
      <small>Condition: <strong>${tags.join(` ${operator} `) || "(none)"}</strong></small><br>
      <small>Action: ${actionText}</small>
    `;

    container.appendChild(div);
  });

  // Create Rule Form
  const formHTML = `
    <div style="margin-top:20px; padding:16px; background:#1e2937; border-radius:8px;">
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

      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <input type="text" id="new-rule-folder-id" placeholder="Folder ID (for Move)" style="flex:1;">
        <button type="button" id="choose-folder-btn">Choose folder...</button>
      </div>

      <button id="create-rule-btn">Create Rule</button>
    </div>
  `;

  container.insertAdjacentHTML("beforeend", formHTML);

  // Event delegation - very stable
  container.onclick = function(e) {
    const target = e.target;

    // Delete rule
    if (target.dataset.action === "delete") {
      const index = parseInt(target.dataset.index);
      if (confirm("Delete this rule?")) {
        currentActions.splice(index, 1);
        renderActions();
      }
      return;
    }

    // Choose folder
    if (target.id === "choose-folder-btn") {
      chooseFolderForRule();
      return;
    }

    // Create rule
    if (target.id === "create-rule-btn") {
      createNewRule();
    }
  };
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

async function chooseFolderForRule() {
  try {
    const accounts = await browser.accounts.list();
    if (!accounts?.length) return alert("No accounts found.");

    const folders = await browser.folders.getSubFolders(accounts[0].rootFolder, false);
    if (!folders?.length) return alert("No folders found.");

    let list = folders.map((f, i) => `${i + 1}. ${f.name}`).join("\n");
    const choice = prompt("Select folder number:\n\n" + list);
    const idx = parseInt(choice) - 1;

    if (folders[idx]) {
      document.getElementById("new-rule-folder-id").value = folders[idx].id || folders[idx].path;
    }
  } catch (e) {
    console.error(e);
    alert("Could not load folders.");
  }
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
  try {
    const accounts = await browser.accounts.list();
    if (!accounts?.length) return alert("No accounts found.");

    const folders = await browser.folders.getSubFolders(accounts[0].rootFolder, false);
    if (!folders?.length) return alert("No folders found.");

    let list = folders.map((f, i) => `${i + 1}. ${f.name}`).join("\n");
    const choice = prompt("Select folder to run classification on:\n\n" + list);
    const idx = parseInt(choice) - 1;

    if (!folders[idx]) return;

    const folderId = folders[idx].id || folders[idx].path;

    if (!confirm(`Run AI classification on folder "${folders[idx].name}"?`)) return;

    // For now we just show how it would work
    alert(`Would run classification on folder: ${folders[idx].name}\n\nFolder ID: ${folderId}\n\n(Full implementation requires classifyFolder background support)`);

    // Future: await browser.runtime.sendMessage({ type: "classifyFolder", folderId });
  } catch (e) {
    console.error(e);
    alert("Could not load folders.");
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
