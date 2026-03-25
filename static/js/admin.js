/* ═══════════════════════════════════════════════════════
   admin.js — Admin Panel Logic
   ═══════════════════════════════════════════════════════ */

const API_BASE = "";   // same origin; change to http://localhost:5000 for local dev

// ── State ────────────────────────────────────────────────────
let credentials  = { username: "", password: "" };
let complaints   = [];
let activeFilter = { status: "", department: "" };

// ── DOM refs ─────────────────────────────────────────────────
const loginOverlay    = document.getElementById("loginOverlay");
const adminShell      = document.getElementById("adminShell");
const loginUser       = document.getElementById("loginUser");
const loginPass       = document.getElementById("loginPass");
const loginBtn        = document.getElementById("loginBtn");
const loginError      = document.getElementById("loginError");
const passToggle      = document.getElementById("passToggle");
const logoutBtn       = document.getElementById("logoutBtn");
const refreshBtn      = document.getElementById("refreshBtn");
const complaintsList  = document.getElementById("complaintsList");
const panelTitle      = document.getElementById("panelTitle");
const panelCount      = document.getElementById("panelCount");
const statTotal       = document.getElementById("statTotal");
const statPending     = document.getElementById("statPending");
const statResolved    = document.getElementById("statResolved");
const deptNav         = document.getElementById("deptNav");
const modalOverlay    = document.getElementById("modalOverlay");
const modalBody       = document.getElementById("modalBody");
const modalClose      = document.getElementById("modalClose");
const successToast    = document.getElementById("successToast");
const errorToast      = document.getElementById("errorToast");

// ── Login ────────────────────────────────────────────────────
loginBtn.addEventListener("click", login);
loginPass.addEventListener("keydown", e => { if (e.key === "Enter") login(); });

passToggle.addEventListener("click", () => {
  loginPass.type = loginPass.type === "password" ? "text" : "password";
});

async function login() {
  const username = loginUser.value.trim();
  const password = loginPass.value;

  if (!username || !password) {
    loginError.textContent = "Please enter your credentials.";
    return;
  }

  setLoginLoading(true);
  loginError.textContent = "";

  try {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      loginError.textContent = "Invalid username or password.";
      return;
    }

    credentials = { username, password };
    loginOverlay.style.display = "none";
    adminShell.style.display   = "flex";
    fetchComplaints();

  } catch (err) {
    loginError.textContent = "Network error. Please try again.";
  } finally {
    setLoginLoading(false);
  }
}

function setLoginLoading(loading) {
  loginBtn.classList.toggle("loading", loading);
  loginBtn.disabled = loading;
}

// ── Logout ───────────────────────────────────────────────────
logoutBtn.addEventListener("click", () => {
  credentials = { username: "", password: "" };
  adminShell.style.display   = "none";
  loginOverlay.style.display = "flex";
  loginUser.value = "";
  loginPass.value = "";
});

// ── Fetch complaints ─────────────────────────────────────────
refreshBtn.addEventListener("click", fetchComplaints);

async function fetchComplaints() {
  setListLoading(true);

  try {
    const res = await fetch(`${API_BASE}/complaints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...credentials, ...activeFilter }),
    });

    if (res.status === 401) {
      showToast(errorToast, "Session expired. Please log in again.");
      logoutBtn.click();
      return;
    }

    const data = await res.json();
    complaints = data.complaints || [];
    renderComplaints();
    renderStats();
    renderDeptNav();
  } catch (err) {
    complaintsList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠</div>Failed to load complaints.</div>`;
  } finally {
    setListLoading(false);
  }
}

function setListLoading(loading) {
  if (loading) {
    complaintsList.innerHTML = `<div class="loading-state">Loading complaints…</div>`;
  }
}

// ── Render complaints ─────────────────────────────────────────
function renderComplaints() {
  const filterLabel = activeFilter.status
    ? (activeFilter.status === "pending" ? "Pending" : "Resolved")
    : activeFilter.department || "All Complaints";

  panelTitle.textContent = filterLabel;
  panelCount.textContent = `${complaints.length} complaint${complaints.length !== 1 ? "s" : ""}`;

  if (complaints.length === 0) {
    complaintsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        No complaints found.
      </div>`;
    return;
  }

  complaintsList.innerHTML = "";
  complaints.forEach((c, i) => {
    const card = buildCard(c, i);
    complaintsList.appendChild(card);
  });
}

function buildCard(c, delay) {
  const div = document.createElement("div");
  div.className = `complaint-card${c.status === "resolved" ? " resolved" : ""}`;
  div.style.animationDelay = `${delay * 0.04}s`;

  const date = formatDate(c.created_at);
  const submitter = c.name
    ? `${c.name}${c.email ? ` · ${c.email}` : ""}`
    : "Anonymous";

  div.innerHTML = `
    <span class="card-badge badge-${c.status}">${c.status}</span>
    <div class="card-body">
      <div class="card-meta">
        <span class="card-id">#${c.id}</span>
        <span class="card-dept">${esc(c.department)}</span>
        <span class="card-date">${date}</span>
      </div>
      <div class="card-title">${esc(c.title)}</div>
      <div class="card-desc">${esc(c.description)}</div>
      <div class="card-submitter">by ${esc(submitter)}</div>
    </div>
    <div class="card-actions" id="actions-${c.id}"></div>
  `;

  // Bind click to open modal
  div.querySelector(".card-body").addEventListener("click", () => openModal(c));
  div.querySelector(".card-badge").addEventListener("click", () => openModal(c));

  // Action buttons
  const actions = div.querySelector(`#actions-${c.id}`);
  renderCardActions(actions, c);

  return div;
}

function renderCardActions(container, c) {
  container.innerHTML = "";

  const toggleBtn = document.createElement("button");
  if (c.status === "pending") {
    toggleBtn.className = "btn btn-success btn-sm btn-icon";
    toggleBtn.title = "Mark as resolved";
    toggleBtn.textContent = "✓";
    toggleBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleStatus(c.id, "resolved"); });
  } else {
    toggleBtn.className = "btn btn-warning btn-sm btn-icon";
    toggleBtn.title = "Mark as pending";
    toggleBtn.textContent = "↩";
    toggleBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleStatus(c.id, "pending"); });
  }

  const delBtn = document.createElement("button");
  delBtn.className = "btn btn-danger btn-sm btn-icon";
  delBtn.title = "Delete complaint";
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteComplaint(c.id); });

  container.appendChild(toggleBtn);
  container.appendChild(delBtn);
}

// ── Stats ────────────────────────────────────────────────────
async function renderStats() {
  // Always compute from the full dataset (re-fetch without filter)
  try {
    const res = await fetch(`${API_BASE}/complaints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    if (!res.ok) return;
    const data = await res.json();
    const all = data.complaints || [];
    statTotal.textContent    = all.length;
    statPending.textContent  = all.filter(c => c.status === "pending").length;
    statResolved.textContent = all.filter(c => c.status === "resolved").length;
  } catch (_) { /* silent */ }
}

// ── Dept nav ─────────────────────────────────────────────────
function renderDeptNav() {
  // Derive unique depts from current complaints
  const allDepts = [...new Set(complaints.map(c => c.department))].sort();
  deptNav.innerHTML = "";
  allDepts.forEach(dept => {
    const a = document.createElement("a");
    a.href = "#";
    a.className = "nav-item";
    a.textContent = dept;
    a.dataset.dept = dept;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      setFilter({ department: dept, status: "" });
    });
    deptNav.appendChild(a);
  });
}

// ── Filter ───────────────────────────────────────────────────
document.querySelectorAll(".sidebar-nav .nav-item[data-filter]").forEach(item => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    setFilter({ status: item.dataset.filter, department: "" });
  });
});

function setFilter(f) {
  activeFilter = f;
  // Update active state
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const match = document.querySelector(
    f.department
      ? `[data-dept="${f.department}"]`
      : `[data-filter="${f.status}"]`
  );
  if (match) match.classList.add("active");
  fetchComplaints();
}

// ── Toggle status ─────────────────────────────────────────────
async function toggleStatus(id, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/resolve/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...credentials, status: newStatus }),
    });
    if (!res.ok) throw new Error();
    showToast(successToast, `✓ Complaint #${id} marked as ${newStatus}.`);
    fetchComplaints();
  } catch {
    showToast(errorToast, "Failed to update complaint.");
  }
}

// ── Delete ───────────────────────────────────────────────────
async function deleteComplaint(id) {
  if (!confirm(`Delete complaint #${id}? This cannot be undone.`)) return;
  try {
    const res = await fetch(`${API_BASE}/delete/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    if (!res.ok) throw new Error();
    showToast(successToast, `✓ Complaint #${id} deleted.`);
    closeModal();
    fetchComplaints();
  } catch {
    showToast(errorToast, "Failed to delete complaint.");
  }
}

// ── Modal ────────────────────────────────────────────────────
function openModal(c) {
  const submitter = c.name
    ? `${c.name}${c.email ? ` (${c.email})` : ""}`
    : "Anonymous";

  modalBody.innerHTML = `
    <div class="modal-field">
      <div class="modal-field-label">Complaint #${c.id}</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;">
        <span class="card-badge badge-${c.status}">${c.status}</span>
        <span class="card-dept">${esc(c.department)}</span>
      </div>
    </div>
    <div class="modal-field">
      <div class="modal-field-label">Title</div>
      <div class="modal-field-value" style="font-size:18px;font-weight:700;">${esc(c.title)}</div>
    </div>
    <div class="modal-field">
      <div class="modal-field-label">Description</div>
      <div class="modal-field-value">${esc(c.description)}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="modal-field">
        <div class="modal-field-label">Submitted By</div>
        <div class="modal-field-value" style="font-size:13px;">${esc(submitter)}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Submitted At</div>
        <div class="modal-field-value" style="font-size:13px;">${formatDate(c.created_at, true)}</div>
      </div>
    </div>
    <div class="modal-actions">
      ${c.status === "pending"
        ? `<button class="btn btn-success" onclick="toggleStatus(${c.id},'resolved');closeModal();">✓ Mark Resolved</button>`
        : `<button class="btn btn-warning" onclick="toggleStatus(${c.id},'pending');closeModal();">↩ Mark Pending</button>`
      }
      <button class="btn btn-danger" onclick="deleteComplaint(${c.id})">✕ Delete</button>
    </div>
  `;
  modalOverlay.classList.add("open");
}

function closeModal() {
  modalOverlay.classList.remove("open");
}

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// ── Utilities ────────────────────────────────────────────────
function esc(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatDate(iso, long = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (long) return d.toLocaleString("en-IN", { dateStyle:"medium", timeStyle:"short" });
  return d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
}

let toastTimeout;
function showToast(el, msg) {
  clearTimeout(toastTimeout);
  el.textContent = msg;
  el.classList.add("show");
  toastTimeout = setTimeout(() => el.classList.remove("show"), 4000);
}
