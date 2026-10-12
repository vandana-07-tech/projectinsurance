const SAMPLE_REQUIREMENT =
  "As a beneficiary, I should be able to submit a life insurance death claim against an active life policy. The system should accept the claim only when the policy is active, the date of death falls within the policy period, the claim amount does not exceed the policy sum assured, and duplicate claims for the same death event are rejected.";

const TOTAL_STEPS = 6;
const SHEET_STATUS_KEY = "icfta-requirement-sheet-status";

let sessionId = null;
let project = null;
let dependencies = null;
let coverageByRule = {};
let selectedRules = new Set();
let selectedScenarios = new Set();
let lastSummary = null;
let mockBaseUrl = "http://127.0.0.1:3001";
let maxUnlockedStep = 1;
let catalogReqId = null;
let autoDeselectedByRule = {}; // ruleId -> [scenarioIds]

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || res.statusText);
  return data;
}

function setStatus(msg, isError = false) {
  const el = document.getElementById("statusMsg");
  el.textContent = msg || "";
  el.className = isError ? "status error" : "status";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showStep(step) {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    document.getElementById(`panel-${i}`).classList.toggle("hidden", i !== step);
    const nav = document.querySelector(`.step[data-step="${i}"]`);
    nav.classList.toggle("active", i === step);
    nav.disabled = i > maxUnlockedStep;
  }
}

function unlockStep(step) {
  maxUnlockedStep = Math.max(maxUnlockedStep, step);
  showStep(step);
}

function setBusy(busy) {
  [
    "btnAnalyze",
    "btnToScenarios",
    "btnSelectAllRules",
    "btnSelectAllScenarios",
    "btnToTestData",
    "btnGenFixtures",
    "btnToApiTest",
    "btnRunNewman",
    "btnToAnalysis",
    "btnToResults",
    "btnBack1",
    "btnBack2",
    "btnBack3",
    "btnBack4",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = busy;
  });
  const ta = document.getElementById("requirementText");
  if (ta) ta.readOnly = busy;
}

function saveSheetStatus(summary) {
  if (!catalogReqId || !summary) return;
  const all = JSON.parse(localStorage.getItem(SHEET_STATUS_KEY) || "{}");
  all[catalogReqId] = {
    overallStatus: summary.overallStatus,
    passed: summary.passed,
    totalTests: summary.totalTests,
    findings: (project?.findings || []).length,
    at: new Date().toISOString(),
    runId: summary.runId,
  };
  localStorage.setItem(SHEET_STATUS_KEY, JSON.stringify(all));
}

async function initConfig() {
  try {
    const cfg = await api("/config/demo");
    mockBaseUrl = cfg.mockApiBaseUrl;
    document.getElementById("configLine").textContent =
      `Mock API: ${cfg.mockApiBaseUrl} · Runner: ${cfg.runner} · Format: ${cfg.collectionFormat}`;
    document.getElementById("defectToggle").checked = !!cfg.intentionalDefect;
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function loadCatalogRequirement() {
  const params = new URLSearchParams(window.location.search);
  const reqId = params.get("req");
  if (!reqId) return;
  try {
    const item = await api(`/requirement-sheet/${encodeURIComponent(reqId)}`);
    catalogReqId = item.id;
    document.getElementById("requirementText").value = item.text;
    document.getElementById("catalogBadge").textContent =
      `Loaded from requirement sheet: ${item.id} — ${item.title}`;
    setStatus(`Loaded ${item.id}. Click Run Requirement Agent to start.`);
  } catch (err) {
    setStatus(`Could not load requirement ${reqId}: ${err.message}`, true);
  }
}

function scenariosForRule(ruleId) {
  return (project?.scenarios || []).filter((s) => (s.businessRuleIds || []).includes(ruleId));
}

function syncScenarioCards() {
  document.querySelectorAll("#scenariosInteractive .card").forEach((card) => {
    const id = card.dataset.scenario;
    const on = selectedScenarios.has(id);
    card.classList.toggle("selected", on);
    card.setAttribute("aria-checked", on ? "true" : "false");
  });
}

function applyRuleSelectionToScenarios(ruleId, selected) {
  const related = scenariosForRule(ruleId);
  if (!related.length) return;

  if (!selected) {
    const removed = [];
    for (const s of related) {
      if (selectedScenarios.has(s.id)) {
        selectedScenarios.delete(s.id);
        removed.push(s.id);
      }
    }
    autoDeselectedByRule[ruleId] = removed;
    if (removed.length) {
      setStatus(
        `Unselected rule ${ruleId} → auto-unselected scenarios: ${removed.join(", ")}`
      );
    }
  } else {
    // Re-select scenarios whose rules are all currently selected
    const restored = [];
    for (const s of related) {
      const allRulesOn = (s.businessRuleIds || []).every((id) => selectedRules.has(id));
      if (allRulesOn && !selectedScenarios.has(s.id)) {
        selectedScenarios.add(s.id);
        restored.push(s.id);
      }
    }
    delete autoDeselectedByRule[ruleId];
    if (restored.length) {
      setStatus(`Selected rule ${ruleId} → restored scenarios: ${restored.join(", ")}`);
    }
  }
  syncScenarioCards();
  renderCoverageNote();
}

function renderCoverageNote() {
  const chips = document.getElementById("coverageChips");
  if (!chips) return;
  const parts = Object.entries(coverageByRule).map(([ruleId, scIds]) => {
    const active = selectedRules.has(ruleId);
    const selectedSc = scIds.filter((id) => selectedScenarios.has(id));
    return `<span class="chip ${active ? "" : "muted"}">${escapeHtml(ruleId)} → ${escapeHtml(selectedSc.join(", ") || "(none selected)")}</span>`;
  });
  chips.innerHTML = parts.join("");
}

function renderDependencies() {
  const rules = dependencies?.rules || project?.requirement?.rules || [];
  selectedRules = new Set(rules.map((r) => r.id));
  document.getElementById("requirementOutput").classList.remove("hidden");

  document.getElementById("rulesInteractive").innerHTML = rules
    .map(
      (r) => `
      <article class="card selected" data-rule="${escapeHtml(r.id)}" tabindex="0" role="checkbox" aria-checked="true">
        <div class="head">
          <div>
            <div class="id">${escapeHtml(r.id)}</div>
            <div>${escapeHtml(r.description)}</div>
            <div class="meta">${escapeHtml(r.condition)}</div>
          </div>
          <span class="tag">${escapeHtml(r.category)}</span>
        </div>
      </article>`
    )
    .join("");

  const suggested = project?.requirement?.suggestedRules || dependencies?.suggestedRules || [];
  document.getElementById("suggestedRules").innerHTML = suggested.length
    ? suggested
        .map(
          (r) => `
      <article class="card" data-suggested="${escapeHtml(r.id)}">
        <div class="head">
          <div>
            <div class="id">${escapeHtml(r.id)}</div>
            <div>${escapeHtml(r.description)}</div>
          </div>
          <button type="button" class="btn" data-add-rule="${escapeHtml(r.id)}">Add</button>
        </div>
      </article>`
        )
        .join("")
    : '<p class="muted">No additional suggestions for this requirement.</p>';

  document.getElementById("dependencyMap").innerHTML = (dependencies?.edges || [])
    .map(
      (e) =>
        `<div class="dep-edge"><strong>${escapeHtml(e.from)}</strong> → <strong>${escapeHtml(e.to)}</strong></div>`
    )
    .join("") || '<p class="muted">No explicit cross-links beyond rule list.</p>';

  document.getElementById("fieldsList").innerHTML = (dependencies?.fields || [])
    .map(
      (f) =>
        `<span class="field-pill">${escapeHtml(f.name)} <span class="muted">(${escapeHtml(f.dataType)}${f.required ? ", required" : ""})</span></span>`
    )
    .join("") || '<span class="muted">None</span>';

  document.getElementById("questionsList").innerHTML = (dependencies?.openQuestions || [])
    .map((q) => `<li><strong>${escapeHtml(q.id)}</strong>: ${escapeHtml(q.question)}</li>`)
    .join("") || "<li class='muted'>None</li>";

  document.getElementById("assumptionsList").innerHTML = (dependencies?.assumptions || [])
    .map((a) => `<li>${escapeHtml(a)}</li>`)
    .join("") || "<li class='muted'>None</li>";

  document.querySelectorAll("#rulesInteractive .card").forEach((card) => {
    card.addEventListener("click", () => toggleRuleCard(card));
  });

  document.querySelectorAll("[data-add-rule]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      addSuggestedRule(btn.getAttribute("data-add-rule"));
    });
  });
}

function addSuggestedRule(ruleId) {
  if (!project?.requirement) return;
  const suggested = project.requirement.suggestedRules || [];
  const rule = suggested.find((r) => r.id === ruleId);
  if (!rule) return;
  if (project.requirement.rules.some((r) => r.id === ruleId)) {
    setStatus(`Rule ${ruleId} already in active set.`);
    return;
  }
  project.requirement.rules = [...project.requirement.rules, { ...rule, status: "draft" }];
  project.requirement.suggestedRules = suggested.filter((r) => r.id !== ruleId);
  if (dependencies) {
    dependencies.rules = project.requirement.rules;
    dependencies.suggestedRules = project.requirement.suggestedRules;
  }
  selectedRules.add(ruleId);
  renderDependencies();
  setStatus(`Added suggested rule ${ruleId}. It will be included when you continue to Fraud Scenario Agent.`);
}

function toggleRuleCard(card) {
  const id = card.dataset.rule;
  const turningOff = selectedRules.has(id);
  if (turningOff) {
    selectedRules.delete(id);
    card.classList.remove("selected");
    card.setAttribute("aria-checked", "false");
  } else {
    selectedRules.add(id);
    card.classList.add("selected");
    card.setAttribute("aria-checked", "true");
  }
  // If scenarios already exist, keep them in sync
  if (project?.scenarios?.length) {
    applyRuleSelectionToScenarios(id, !turningOff);
  }
}

function renderScenarios() {
  const scenarios = project?.scenarios || [];
  // Keep only scenarios whose rules intersect selected rules; default-select those fully covered
  selectedScenarios = new Set(
    scenarios
      .filter((s) => (s.businessRuleIds || []).every((id) => selectedRules.has(id)))
      .map((s) => s.id)
  );

  document.getElementById("scenariosInteractive").innerHTML = scenarios
    .map((s) => {
      const blocked = (s.businessRuleIds || []).some((id) => !selectedRules.has(id));
      const selected = selectedScenarios.has(s.id);
      return `
      <article class="card ${selected ? "selected" : ""} ${blocked ? "muted" : ""}"
        data-scenario="${escapeHtml(s.id)}" tabindex="0" role="checkbox" aria-checked="${selected}">
        <div class="head">
          <div>
            <div class="id">${escapeHtml(s.id)} — ${escapeHtml(s.name)}</div>
            <div>${escapeHtml(s.description)}</div>
            <div class="meta">Expected: <strong>${escapeHtml(s.expectedOutcome)}</strong>
              ${s.expectedStatusCodes ? ` · HTTP ${escapeHtml(s.expectedStatusCodes.join("/"))}` : ""}</div>
            ${blocked ? `<div class="meta fail">Depends on unselected rule(s)</div>` : ""}
          </div>
          <span class="tag">${escapeHtml(s.category)}</span>
        </div>
        <div class="tags">
          ${(s.businessRuleIds || [])
            .map(
              (id) =>
                `<span class="tag ${selectedRules.has(id) ? "" : "fail"}">${escapeHtml(id)}</span>`
            )
            .join("")}
        </div>
      </article>`;
    })
    .join("");

  document.querySelectorAll("#scenariosInteractive .card").forEach((card) => {
    card.addEventListener("click", () => toggleScenarioCard(card));
  });
  renderCoverageNote();
}

function toggleScenarioCard(card) {
  const id = card.dataset.scenario;
  const scenario = (project?.scenarios || []).find((s) => s.id === id);
  if (!scenario) return;
  const missingRules = (scenario.businessRuleIds || []).filter((rid) => !selectedRules.has(rid));
  if (missingRules.length && !selectedScenarios.has(id)) {
    setStatus(
      `Cannot select ${id}: business rule(s) unselected: ${missingRules.join(", ")}`,
      true
    );
    return;
  }
  if (selectedScenarios.has(id)) {
    selectedScenarios.delete(id);
    card.classList.remove("selected");
    card.setAttribute("aria-checked", "false");
  } else {
    selectedScenarios.add(id);
    card.classList.add("selected");
    card.setAttribute("aria-checked", "true");
  }
  renderCoverageNote();
}

function renderFixtures() {
  const fixtures = project?.fixtures || [];
  document.getElementById("fixturesView").innerHTML = fixtures.length
    ? `<table>
      <thead><tr><th>Scenario</th><th>Fixture</th><th>Synthetic payload</th></tr></thead>
      <tbody>
        ${fixtures
          .map(
            (f) => `<tr>
              <td>${escapeHtml(f.scenarioId)}</td>
              <td>${escapeHtml(f.id)}</td>
              <td><pre class="payload">${escapeHtml(JSON.stringify(f.requestPayload, null, 2))}</pre></td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`
    : '<p class="muted">No fixtures yet.</p>';
}

function renderExecution(summary) {
  lastSummary = summary;
  const col = project?.collection;
  document.getElementById("collectionView").innerHTML = col
    ? `<p><strong>${escapeHtml(col.name)}</strong></p>
       <p>Requests: ${col.requestCount} · Runner: <strong>Newman</strong> · Target: <code>${escapeHtml(mockBaseUrl)}</code></p>`
    : '<p class="muted">No collection.</p>';

  document.getElementById("runResults").innerHTML = `
    <p><strong>Run ${escapeHtml(summary.runId)}</strong> —
      ${escapeHtml(summary.overallStatus)} (${summary.passed}/${summary.totalTests} passed)</p>
    <table>
      <thead><tr><th>Scenario</th><th>Request</th><th>Result</th><th>HTTP</th><th>ms</th></tr></thead>
      <tbody>
        ${(summary.results || [])
          .map(
            (r) => `<tr>
              <td>${escapeHtml(r.scenarioId || "")}</td>
              <td>${escapeHtml(r.requestName)}</td>
              <td class="${r.status === "passed" ? "pass" : "fail"}">${escapeHtml(r.status)}</td>
              <td>${r.httpStatus ?? ""}</td>
              <td>${r.responseTimeMs ?? ""}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function renderFindings(targetId) {
  const findings = project?.findings || [];
  document.getElementById(targetId).innerHTML = findings.length
    ? findings
        .map(
          (f) => `<article class="finding ${escapeHtml(f.severity)}">
            <h3>${escapeHtml(f.title)}</h3>
            <p><strong>${escapeHtml(f.classification)}</strong> · ${escapeHtml(f.severity)}</p>
            <p>Rules: ${escapeHtml((f.businessRuleIds || []).join(", "))} · Scenarios: ${escapeHtml((f.scenarioIds || []).join(", "))}</p>
            <p><strong>Expected:</strong> ${escapeHtml(f.expectedBehavior)}</p>
            <p><strong>Actual:</strong> ${escapeHtml(f.actualBehavior)}</p>
            <pre class="payload">${escapeHtml((f.evidence || []).join("\n"))}</pre>
          </article>`
        )
        .join("")
    : '<p class="muted">No potential defects found for this run.</p>';
}

function renderFinalResults() {
  const summary = lastSummary;
  if (!summary) return;
  document.getElementById("runSummary").innerHTML = [
    ["Status", summary.overallStatus],
    ["Total", summary.totalTests],
    ["Passed", summary.passed],
    ["Failed", summary.failed],
    ["Runner", summary.runnerName || "newman"],
    ["Findings", (project?.findings || []).length],
  ]
    .map(
      ([l, n]) =>
        `<div class="stat"><div class="n">${escapeHtml(String(n))}</div><div class="l">${escapeHtml(l)}</div></div>`
    )
    .join("");
  document.getElementById("finalResults").innerHTML = document.getElementById("runResults").innerHTML;
  renderFindings("finalFindings");
  if (project?.collection && summary.runId) {
    document.getElementById("reportJson").href = `/api/projects/${project.id}/reports/${summary.runId}`;
    document.getElementById("reportHtml").href = `/api/projects/${project.id}/reports/${summary.runId}?format=html`;
    document.getElementById("exportCollection").href =
      `/api/projects/${project.id}/collections/${project.collection.id}/export`;
  }
  saveSheetStatus(summary);
}

function resetFlow() {
  sessionId = null;
  project = null;
  dependencies = null;
  coverageByRule = {};
  selectedRules = new Set();
  selectedScenarios = new Set();
  lastSummary = null;
  autoDeselectedByRule = {};
  maxUnlockedStep = 1;
  if (!catalogReqId) document.getElementById("requirementText").value = SAMPLE_REQUIREMENT;
  document.getElementById("requirementOutput").classList.add("hidden");
  document.getElementById("btnToApiTest").classList.add("hidden");
  document.getElementById("btnToAnalysis").classList.add("hidden");
  showStep(1);
  setStatus(catalogReqId ? `Sheet requirement ${catalogReqId} still loaded.` : "");
}

document.getElementById("analyzeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = document.getElementById("requirementText").value.trim();
  if (text.length < 10) {
    setStatus("Please enter a fuller requirement.", true);
    return;
  }
  try {
    setBusy(true);
    setStatus("Requirement Agent running…");
    const result = await api("/analyze", {
      method: "POST",
      body: JSON.stringify({
        name: catalogReqId ? `Demo ${catalogReqId}` : "Life claim analysis",
        requirementText: text,
        productType: "life",
        executionMode: "mock",
      }),
    });
    project = result.project;
    dependencies = {
      ...result.dependencies,
      suggestedRules: project.requirement?.suggestedRules || [],
    };
    sessionId = project.id;
    if (project.workflowState === "failed") throw new Error(project.lastError || "Requirement Agent failed");
    renderDependencies();
    setStatus(
      `Requirement Agent: ${dependencies.rules.length} rules, ${(project.requirement.suggestedRules || []).length} suggestions.`
    );
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
  }
});

document.getElementById("btnToScenarios").addEventListener("click", async () => {
  if (!sessionId || !project?.requirement) return;
  if (!selectedRules.size) {
    setStatus("Select at least one business rule.", true);
    return;
  }
  try {
    setBusy(true);
    setStatus("Fraud Scenario Agent running…");
    const rules = project.requirement.rules.map((r) => ({
      ...r,
      status: selectedRules.has(r.id) ? "approved" : "rejected",
    }));
    const result = await api(`/sessions/${sessionId}/scenarios`, {
      method: "POST",
      body: JSON.stringify({ rules }),
    });
    project = result.project;
    coverageByRule = result.coverageByRule || {};
    if (project.workflowState === "failed") throw new Error(project.lastError || "Fraud Scenario Agent failed");
    renderScenarios();
    unlockStep(2);
    setStatus(`Fraud Scenario Agent: ${project.scenarios.length} scenarios. Dependent links are active.`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
  }
});

document.getElementById("btnToTestData").addEventListener("click", () => {
  if (!selectedScenarios.size) {
    setStatus("Select at least one scenario.", true);
    return;
  }
  document.getElementById("btnToApiTest").classList.add("hidden");
  unlockStep(3);
  setStatus("Ready for Test Data Agent.");
});

document.getElementById("btnGenFixtures").addEventListener("click", async () => {
  if (!sessionId || !project) return;
  try {
    setBusy(true);
    setStatus("Test Data Agent running…");
    const result = await api(`/sessions/${sessionId}/test-data`, {
      method: "POST",
      body: JSON.stringify({
        scenarios: project.scenarios.map((s) => ({
          id: s.id,
          status: selectedScenarios.has(s.id) ? "approved" : "rejected",
        })),
      }),
    });
    project = result.project;
    if (project.workflowState === "failed") throw new Error(project.lastError || "Test Data Agent failed");
    renderFixtures();
    document.getElementById("btnToApiTest").classList.remove("hidden");
    setStatus(`Test Data Agent: ${project.fixtures.length} fixtures ready.`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
  }
});

document.getElementById("btnToApiTest").addEventListener("click", () => {
  document.getElementById("btnToAnalysis").classList.add("hidden");
  unlockStep(4);
  setStatus("Ready for API Test Agent (Newman).");
});

document.getElementById("btnRunNewman").addEventListener("click", async () => {
  if (!sessionId) return;
  try {
    setBusy(true);
    setStatus("API Test Agent: Postman collection + Newman…");
    const result = await api(`/sessions/${sessionId}/api-tests`, { method: "POST", body: "{}" });
    project = result.project;
    lastSummary = result.summary;
    renderExecution(result.summary);
    document.getElementById("btnToAnalysis").classList.remove("hidden");
    saveSheetStatus(result.summary);
    setStatus(
      `API Test Agent (Newman): ${result.summary.overallStatus} — ${result.summary.passed}/${result.summary.totalTests} passed`
    );
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
  }
});

document.getElementById("btnToAnalysis").addEventListener("click", () => {
  renderFindings("findingsView");
  unlockStep(5);
  setStatus("Fraud Analysis Agent: review findings.");
});

document.getElementById("btnToResults").addEventListener("click", () => {
  renderFinalResults();
  unlockStep(6);
  setStatus("Results ready. Sheet status updated for this requirement.");
});

document.getElementById("btnSelectAllRules").addEventListener("click", () => {
  document.querySelectorAll("#rulesInteractive .card").forEach((card) => {
    const id = card.dataset.rule;
    if (!selectedRules.has(id)) {
      selectedRules.add(id);
      card.classList.add("selected");
      if (project?.scenarios?.length) applyRuleSelectionToScenarios(id, true);
    }
  });
});

document.getElementById("btnSelectAllScenarios").addEventListener("click", () => {
  (project?.scenarios || []).forEach((s) => {
    if ((s.businessRuleIds || []).every((id) => selectedRules.has(id))) {
      selectedScenarios.add(s.id);
    }
  });
  syncScenarioCards();
  renderCoverageNote();
});

document.getElementById("btnBack1").addEventListener("click", () => showStep(1));
document.getElementById("btnBack2").addEventListener("click", () => showStep(2));
document.getElementById("btnBack3").addEventListener("click", () => showStep(3));
document.getElementById("btnBack4").addEventListener("click", () => showStep(4));
document.getElementById("btnRestart").addEventListener("click", resetFlow);
document.getElementById("btnNewAnalysis").addEventListener("click", resetFlow);

document.getElementById("defectToggle").addEventListener("change", async (e) => {
  try {
    await api("/config/intentional-defect", {
      method: "POST",
      body: JSON.stringify({ enabled: e.target.checked }),
    });
    setStatus(`Intentional defect mode: ${e.target.checked ? "ON" : "OFF"}`);
  } catch (err) {
    setStatus(err.message, true);
  }
});

document.querySelectorAll(".step").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!btn.disabled) showStep(Number(btn.dataset.step));
  });
});

initConfig()
  .then(() => loadCatalogRequirement())
  .then(() => showStep(1));
