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
    row.innerHTML = `
      <input type="text" value="${tag.name}" placeholder="Tag name" style="flex:1; max-width:180px;" data-field="name" data-index="${index}">
      <input type="text" value="${tag.description}" placeholder="Natural language description for the LLM..." style="flex:3;" data-field="description" data-index="${index}">
      <input type="number" value="${tag.priority || 0}" style="width:70px;" title="Priority (higher = more important)" data-field="priority" data-index="${index}">
      <label style="display:flex; align-items:center; gap:4px; white-space:nowrap;">
        <input type="checkbox" ${tag.enabled !== false ? "checked" : ""} data-field="enabled" data-index="${index}"> Enabled
      </label>
      <label style="display:flex; align-items:center; gap:4px; white-space:nowrap;">
        <input type="checkbox" ${tag.stopProcessing ? "checked" : ""} data-field="stopProcessing" data-index="${index}"> Stop
      </label>
      <button class="secondary" style="padding:4px 10px;" onclick="deleteTag(${index})">×</button>
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
      });
    });

    container.appendChild(row);
  });
}

function addNewTag() {
  currentTags.push({
    id: Date.now().toString(36),
    name: "New Tag",
    description: "Describe when this tag should apply...",
    priority: 0,
    enabled: true,
    stopProcessing: false,
  });
  renderTags();
}

async function saveAllTags() {
  // Clean empty names
  currentTags = currentTags.filter(t => t.name && t.name.trim());
  await browser.storage.local.set({ tags: currentTags });
  showStatus("Tags saved successfully!", true);
  // Optional: sync to Thunderbird tags system here in future
}

function deleteTag(index) {
  if (confirm("Delete this tag?")) {
    currentTags.splice(index, 1);
    renderTags();
  }
}

// ==================== ACTIONS (placeholder for v1) ====================
function renderActions() {
  const container = document.getElementById("actions-list");
  container.innerHTML = `<p style="color:#64748b;">Action rules coming in next iteration. You can define tag-based automation here later (move to folder, archive, etc.).</p>`;
}

function addNewAction() {
  alert("Action editor will be implemented in the next step. For now, tags are the core.");
}

async function saveAllActions() {
  await browser.storage.local.set({ actions: currentActions });
}

// ==================== TEST & MANUAL ====================
async function runTestClassification() {
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
      sampleEmail: body,
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

// Make functions global for inline onclick
window.addNewTag = addNewTag;
window.saveAllTags = saveAllTags;
window.deleteTag = deleteTag;
window.addNewAction = addNewAction;
window.saveAllActions = saveAllActions;
window.runTestClassification = runTestClassification;
window.testOllamaConnection = testOllamaConnection;
window.runOnCurrentFolder = runOnCurrentFolder;
window.runOnAllUnprocessed = runOnAllUnprocessed;
