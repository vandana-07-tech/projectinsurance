import { Router } from "express";
import fs from "node:fs/promises";
import { AppError } from "../shared/errors.js";
import { config } from "../config.js";
import {
  analyzeFromRequirement,
  analyzeRequirements,
  approveRequirements,
  approveRulesAndGenerateScenarios,
  approveScenarios,
  approveScenariosAndGenerateTestData,
  approveScenariosAndRunTests,
  buildDependencyView,
  buildReport,
  createProject,
  generateCollection,
  generateScenarios,
  generateTestData,
  getAllProjects,
  getDashboardStats,
  getProjectById,
  getRunDetails,
  markReadyToExecute,
  runApiTestAgentStage,
  startRun,
} from "../orchestrator/workflowService.js";
import {
  isIntentionalDefectEnabled,
  setIntentionalDefect,
} from "../mock-api/store.js";
import { REQUIREMENT_SHEET, getCatalogRequirement } from "../shared/requirementCatalog.js";

export function createApiRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "insurance-claim-fraud-testing-accelerator",
      llmProvider: config.llmProvider,
      mockApiBaseUrl: config.mockApiBaseUrl,
      intentionalDefect: isIntentionalDefectEnabled(),
    });
  });

  router.get("/dashboard", async (_req, res, next) => {
    try {
      res.json(await getDashboardStats());
    } catch (err) {
      next(err);
    }
  });

  /** Hackathon requirement sheet (up to 6) */
  router.get("/requirement-sheet", (_req, res) => {
    res.json({
      updatedAt: new Date().toISOString(),
      count: REQUIREMENT_SHEET.length,
      requirements: REQUIREMENT_SHEET,
    });
  });

  router.get("/requirement-sheet/:id", (req, res, next) => {
    const item = getCatalogRequirement(req.params.id);
    if (!item) {
      return next(new AppError("Requirement not found", "NOT_FOUND", 404));
    }
    res.json(item);
  });

  /** Interactive flow entry: requirement text in → analyzed rules/dependencies out */
  router.post("/analyze", async (req, res, next) => {
    try {
      const project = await analyzeFromRequirement(req.body);
      res.status(201).json({
        project,
        dependencies: buildDependencyView(project),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/sessions/:id/dependencies", async (req, res, next) => {
    try {
      const project = await getProjectById(req.params.id);
      res.json(buildDependencyView(project));
    } catch (err) {
      next(err);
    }
  });

  router.post("/sessions/:id/scenarios", async (req, res, next) => {
    try {
      const project = await approveRulesAndGenerateScenarios(req.params.id, req.body);
      const report = buildReport(project);
      res.json({
        project,
        coverageByRule: report.scenarioCoverageByRule,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Step 3 — Test Data Agent */
  router.post("/sessions/:id/test-data", async (req, res, next) => {
    try {
      const project = await approveScenariosAndGenerateTestData(req.params.id, req.body);
      res.json({ project });
    } catch (err) {
      next(err);
    }
  });

  /** Step 4 — API Test Agent (Postman collection + Newman) */
  router.post("/sessions/:id/api-tests", async (req, res, next) => {
    try {
      const { project, summary } = await runApiTestAgentStage(req.params.id);
      res.status(201).json({
        project,
        summary,
        report: buildReport(project, summary),
      });
    } catch (err) {
      next(err);
    }
  });

  /** Legacy combined run (scenarios → data → newman → analysis) */
  router.post("/sessions/:id/run-tests", async (req, res, next) => {
    try {
      const { project, summary } = await approveScenariosAndRunTests(req.params.id, req.body);
      res.status(201).json({
        project,
        summary,
        report: buildReport(project, summary),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/projects", async (req, res, next) => {
    try {
      const project = await createProject(req.body);
      res.status(201).json(project);
    } catch (err) {
      next(err);
    }
  });

  router.get("/projects", async (_req, res, next) => {
    try {
      res.json(await getAllProjects());
    } catch (err) {
      next(err);
    }
  });

  router.get("/projects/:id", async (req, res, next) => {
    try {
      res.json(await getProjectById(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post("/projects/:id/requirements/analyze", async (req, res, next) => {
    try {
      res.json(await analyzeRequirements(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.put("/projects/:id/requirements/approve", async (req, res, next) => {
    try {
      res.json(await approveRequirements(req.params.id, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.post("/projects/:id/scenarios/generate", async (req, res, next) => {
    try {
      res.json(await generateScenarios(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.put("/projects/:id/scenarios", async (req, res, next) => {
    try {
      res.json(await approveScenarios(req.params.id, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.post("/projects/:id/test-data/generate", async (req, res, next) => {
    try {
      res.json(await generateTestData(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post("/projects/:id/collections/generate", async (req, res, next) => {
    try {
      res.json(await generateCollection(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post("/projects/:id/ready", async (req, res, next) => {
    try {
      res.json(await markReadyToExecute(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.get("/projects/:id/collections/:collectionId", async (req, res, next) => {
    try {
      const project = await getProjectById(req.params.id);
      if (!project.collection || project.collection.id !== req.params.collectionId) {
        throw new AppError("Collection not found", "NOT_FOUND", 404);
      }
      const raw = await fs.readFile(project.collection.collectionPath, "utf8");
      res.type("json").send(raw);
    } catch (err) {
      next(err);
    }
  });

  router.get("/projects/:id/collections/:collectionId/export", async (req, res, next) => {
    try {
      const project = await getProjectById(req.params.id);
      if (!project.collection || project.collection.id !== req.params.collectionId) {
        throw new AppError("Collection not found", "NOT_FOUND", 404);
      }
      res.download(project.collection.collectionPath, `${project.collection.id}.postman_collection.json`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/projects/:id/runs", async (req, res, next) => {
    try {
      const { project, summary } = await startRun(req.params.id, req.body);
      res.status(201).json({ project, summary });
    } catch (err) {
      next(err);
    }
  });

  router.get("/projects/:id/runs/:runId", async (req, res, next) => {
    try {
      const summary = await getRunDetails(req.params.runId);
      if (summary.projectId !== req.params.id) {
        throw new AppError("Run not found for project", "NOT_FOUND", 404);
      }
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  router.get("/projects/:id/runs/:runId/results", async (req, res, next) => {
    try {
      const summary = await getRunDetails(req.params.runId);
      if (summary.projectId !== req.params.id) {
        throw new AppError("Run not found for project", "NOT_FOUND", 404);
      }
      res.json(summary.results);
    } catch (err) {
      next(err);
    }
  });

  router.get("/projects/:id/findings", async (req, res, next) => {
    try {
      const project = await getProjectById(req.params.id);
      res.json(project.findings);
    } catch (err) {
      next(err);
    }
  });

  router.get("/projects/:id/reports/:runId", async (req, res, next) => {
    try {
      const project = await getProjectById(req.params.id);
      const summary = await getRunDetails(req.params.runId);
      const report = buildReport(project, summary);
      if (req.query.format === "html") {
        res.type("html").send(renderHtmlReport(report));
      } else {
        res.json(report);
      }
    } catch (err) {
      next(err);
    }
  });

  router.get("/config/demo", (_req, res) => {
    res.json({
      mockApiBaseUrl: config.mockApiBaseUrl,
      allowedHosts: config.allowedHosts,
      intentionalDefect: isIntentionalDefectEnabled(),
      llmProvider: config.llmProvider,
      runner: "newman",
      collectionFormat: "postman_collection_v2.1",
    });
  });

  router.post("/config/intentional-defect", async (req, res, next) => {
    try {
      const enabled = Boolean(req.body?.enabled);
      setIntentionalDefect(enabled);
      // Also sync standalone mock if separate process
      try {
        await fetch(`${config.mockApiBaseUrl}/admin/intentional-defect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        });
      } catch {
        /* same-process mock */
      }
      res.json({ intentionalDefect: isIntentionalDefectEnabled() });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function renderHtmlReport(report: ReturnType<typeof buildReport>): string {
  const findings = report.findings
    .map(
      (f) => `
      <article class="finding">
        <h3>${escapeHtml(f.title)}</h3>
        <p><strong>Classification:</strong> ${escapeHtml(f.classification)}</p>
        <p><strong>Severity:</strong> ${escapeHtml(f.severity)} | <strong>Confidence:</strong> ${escapeHtml(f.confidence)}</p>
        <p><strong>Expected:</strong> ${escapeHtml(f.expectedBehavior)}</p>
        <p><strong>Actual:</strong> ${escapeHtml(f.actualBehavior)}</p>
        <p><strong>Rules:</strong> ${escapeHtml(f.businessRuleIds.join(", "))}</p>
        <p><strong>Scenarios:</strong> ${escapeHtml(f.scenarioIds.join(", "))}</p>
        <pre>${escapeHtml(f.evidence.join("\n"))}</pre>
        <p><strong>Recommendation:</strong> ${escapeHtml(f.recommendation)}</p>
      </article>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Report — ${escapeHtml(report.projectName)}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 2rem; color: #1a2332; background: #f7f4ef; }
    h1,h2,h3 { font-family: "Segoe UI", sans-serif; }
    .notice { background: #fff3cd; padding: 0.75rem 1rem; border-left: 4px solid #c9a227; }
    .finding { background: #fff; border: 1px solid #d9d2c5; padding: 1rem; margin: 1rem 0; }
    pre { white-space: pre-wrap; background: #f0ebe3; padding: 0.75rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(report.projectName)}</h1>
  <p class="notice">${escapeHtml(report.notice)}</p>
  <h2>Execution</h2>
  <pre>${escapeHtml(JSON.stringify(report.execution, null, 2))}</pre>
  <h2>Findings (${report.findings.length})</h2>
  ${findings || "<p>No findings.</p>"}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
