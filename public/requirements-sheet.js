const STORAGE_KEY = "icfta-requirement-sheet-status";

async function api(path) {
  const res = await fetch(`/api${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || res.statusText);
  return data;
}

function loadStatus() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusChip(entry) {
  if (!entry) return '<span class="tag">not run</span>';
  const cls = entry.overallStatus === "passed" ? "pass" : entry.overallStatus === "failed" ? "fail" : "";
  return `<span class="tag ${cls}">${escapeHtml(entry.overallStatus || "done")} · ${entry.passed ?? 0}/${entry.totalTests ?? 0} · findings ${entry.findings ?? 0}</span>`;
}

function renderSheet(requirements) {
  const status = loadStatus();
  document.getElementById("sheetMeta").textContent =
    `${requirements.length} requirements · status updated ${new Date().toLocaleTimeString()}`;

  document.getElementById("sheetTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Title</th>
          <th>Focus</th>
          <th>Priority</th>
          <th>Tags</th>
          <th>Last run</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${requirements
          .map((r) => {
            const st = status[r.id];
            return `<tr>
              <td><strong>${escapeHtml(r.id)}</strong></td>
              <td>${escapeHtml(r.title)}
                <div class="meta muted" style="max-width:320px">${escapeHtml(r.text.slice(0, 140))}…</div>
              </td>
              <td>${escapeHtml(r.focus)}</td>
              <td><span class="tag">${escapeHtml(r.priority)}</span></td>
              <td>${(r.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ")}</td>
              <td>${statusChip(st)}${st?.at ? `<div class="meta muted">${escapeHtml(new Date(st.at).toLocaleString())}</div>` : ""}</td>
              <td class="actions">
                <a class="btn primary" href="/?req=${encodeURIComponent(r.id)}">Run E2E</a>
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

async function refresh() {
  const data = await api("/requirement-sheet");
  window.__requirements = data.requirements || [];
  renderSheet(window.__requirements);
  document.getElementById("liveBadge").textContent = "live";
}

document.getElementById("btnRefresh").addEventListener("click", () => {
  refresh().catch((err) => {
    document.getElementById("sheetMeta").textContent = err.message;
  });
});

// Soft realtime: refresh status every 5s while page open
refresh().catch((err) => {
  document.getElementById("sheetMeta").textContent = err.message;
});
setInterval(() => {
  renderSheet(
    // keep last known requirements from DOM rebuild via API
    window.__requirements || []
  );
  api("/requirement-sheet")
    .then((data) => {
      window.__requirements = data.requirements || [];
      renderSheet(window.__requirements);
    })
    .catch(() => {});
}, 5000);
