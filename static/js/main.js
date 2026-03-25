/* ═══════════════════════════════════════════════════════
   main.js — Student Complaint Submission
   ═══════════════════════════════════════════════════════ */

const API_BASE = "";   // same origin; change to http://localhost:5000 for local dev

// ── DOM refs ─────────────────────────────────────────────────
const form            = document.getElementById("complaintForm");
const anonToggle      = document.getElementById("anonymousToggle");
const identityFields  = document.getElementById("identityFields");
const anonNote        = document.getElementById("anonNote");
const submitBtn       = document.getElementById("submitBtn");
const titleInput      = document.getElementById("title");
const descInput       = document.getElementById("description");
const titleCount      = document.getElementById("titleCount");
const descCount       = document.getElementById("descCount");
const successToast    = document.getElementById("successToast");
const errorToast      = document.getElementById("errorToast");

// ── Anonymous toggle ─────────────────────────────────────────
anonToggle.addEventListener("change", () => {
  const isAnon = anonToggle.checked;
  if (isAnon) {
    identityFields.style.display = "none";
    anonNote.textContent = "Your identity will not be recorded.";
  } else {
    identityFields.style.display = "block";
    anonNote.textContent = "Your name & email will be recorded.";
  }
});

// ── Character counters ───────────────────────────────────────
titleInput.addEventListener("input", () => {
  titleCount.textContent = `${titleInput.value.length} / 200`;
});
descInput.addEventListener("input", () => {
  descCount.textContent = `${descInput.value.length} / 5000`;
});

// ── Form submission ──────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();

  const isAnon      = anonToggle.checked;
  const name        = isAnon ? null : (document.getElementById("name").value.trim() || null);
  const email       = isAnon ? null : (document.getElementById("email").value.trim() || null);
  const department  = document.getElementById("department").value;
  const title       = titleInput.value.trim();
  const description = descInput.value.trim();

  // Client-side validation
  let hasError = false;

  if (!department) {
    showFieldError("dept-error", "Please select a department.");
    document.getElementById("department").classList.add("invalid");
    hasError = true;
  }
  if (!title) {
    showFieldError("title-error", "Please enter a complaint title.");
    titleInput.classList.add("invalid");
    hasError = true;
  }
  if (!description) {
    showFieldError("desc-error", "Please describe your complaint.");
    descInput.classList.add("invalid");
    hasError = true;
  }
  if (email && !isValidEmail(email)) {
    showFieldError("email-error", "Please enter a valid email.");
    document.getElementById("email")?.classList.add("invalid");
    hasError = true;
  }

  if (hasError) return;

  // Submit
  setLoading(true);

  try {
    const res = await fetch(`${API_BASE}/submit_complaint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, department, title, description, anonymous: isAnon }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(errorToast, data.error || "Submission failed. Please try again.");
      return;
    }

    showToast(successToast, `✓ Complaint #${data.id} submitted successfully!`);
    form.reset();
    titleCount.textContent = "0 / 200";
    descCount.textContent  = "0 / 5000";
    // Re-hide identity fields if anon is checked
    if (anonToggle.checked) identityFields.style.display = "none";

  } catch (err) {
    console.error(err);
    showToast(errorToast, "Network error. Please check your connection.");
  } finally {
    setLoading(false);
  }
});

// ── Helpers ──────────────────────────────────────────────────
function clearErrors() {
  document.querySelectorAll(".field-error").forEach(el => (el.textContent = ""));
  document.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid"));
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setLoading(loading) {
  submitBtn.classList.toggle("loading", loading);
  submitBtn.disabled = loading;
}

let toastTimeout;
function showToast(el, msg) {
  clearTimeout(toastTimeout);
  el.textContent = msg;
  el.classList.add("show");
  toastTimeout = setTimeout(() => el.classList.remove("show"), 4500);
}
