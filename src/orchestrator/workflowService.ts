import { nanoid } from "nanoid";
import { config } from "../config.js";
import { runRequirementAgent } from "../agents/requirementAgent.js";
import { runScenarioAgent } from "../agents/scenarioAgent.js";
import { runTestDataAgent } from "../agents/testDataAgent.js";
import { runApiTestAgent } from "../agents/apiTestAgent.js";
import { runAnalysisAgent } from "../agents/analysisAgent.js";
import { createRunner } from "../runner/newmanRunner.js";
import { assertAllowedTarget } from "../runner/safety.js";
import {
  CreateProjectInputSchema,
  ApproveRulesInputSchema,
  ApproveScenariosInputSchema,
  StartRunInputSchema,
  type Project,
  type ExecutionSummary,
} from "../shared/schemas.js";
import { assertTransition } from "../shared/workflow.js";
import { ValidationError, WorkflowError } from "../shared/errors.js";
import {
  getProject,
  listProjects,
  saveProject,
  saveRun,
  getRun,
} from "../storage/fileStore.js";

function now(): string {
  return new Date().toISOString();
}

function transition(project: Project, to: Project["workflowState"]): void {
  assertTransition(project.workflowState, to);
  project.workflowState = to;
  project.updatedAt = now();
}

export async function createProject(raw: unknown): Promise<Project> {
  const input = CreateProjectInputSchema.parse(raw);
  const project: Project = {
    id: `PRJ-${nanoid(8)}`,
    name: input.name,
    productType: input.productType,
    requirementText: input.requirementText,
    apiSpecText: input.apiSpecText,
    executionMode: input.executionMode,
    workflowState: "draft",
    scenarios: [],
    fixtures: [],
    runs: [],
    findings: [],
    createdAt: now(),
    updatedAt: now(),
  };
  return saveProject(project);
}

export async function getProjectById(id: string): Promise<Project> {
  return getProject(id);
}

export async function getAllProjects(): Promise<Project[]> {
  return listProjects();
}

export async function analyzeRequirements(projectId: string): Promise<Project> {
  const project = await getProject(projectId);
  if (!["draft", "requirements_review", "failed", "completed"].includes(project.workflowState)) {
    // allow from draft or re-run from review/failed
    if (project.workflowState !== "draft" && project.workflowState !== "requirements_review") {
      try {
        transition(project, "requirements_processing");
      } catch {
        project.workflowState = "draft";
      }
    }
  }

  if (project.workflowState === "draft" || project.workflowState === "requirements_review" || project.workflowState === "failed" || project.workflowState === "completed") {
    if (project.workflowState !== "draft") {
      // reset path into processing
      project.workflowState = "draft";
    }
    transition(project, "requirements_processing");
  } else if (project.workflowState !== "requirements_processing") {
    throw new WorkflowError(`Cannot analyze requirements from state ${project.workflowState}`);
  }

  await saveProject(project);

  try {
    const requirement = await runRequirementAgent({
      requirementText: project.requirementText,
      productType: project.productType,
      apiSpecText: project.apiSpecText,
      title: project.name,
    });
    project.requirement = requirement;
    transition(project, "requirements_review");
    project.lastError = undefined;
  } catch (err) {
    project.lastError = err instanceof Error ? err.message : String(err);
    transition(project, "failed");
  }
  return saveProject(project);
}

export async function approveRequirements(projectId: string, raw: unknown): Promise<Project> {
  const input = ApproveRulesInputSchema.parse(raw);
  const project = await getProject(projectId);
  if (!project.requirement) {
    throw new WorkflowError("No requirement document to approve");
  }
  if (project.workflowState !== "requirements_review" && project.workflowState !== "failed") {
    throw new WorkflowError(`Cannot approve requirements from state ${project.workflowState}`);
  }
  if (project.workflowState === "failed") {
    project.workflowState = "requirements_review";
  }

  const approvedCount = input.rules.filter((r) => r.status === "approved").length;
  if (!approvedCount) {
    throw new ValidationError("Approve at least one business rule");
  }

  project.requirement.rules = input.rules;
  if (input.assumptions) project.requirement.assumptions = input.assumptions;
  if (input.openQuestions) project.requirement.openQuestions = input.openQuestions;
  project.requirement.status = "approved";
  project.requirement.updatedAt = now();
  transition(project, "requirements_approved");
  return saveProject(project);
}

export async function generateScenarios(projectId: string): Promise<Project> {
  const project = await getProject(projectId);
  if (project.workflowState !== "requirements_approved" && project.workflowState !== "scenario_review" && project.workflowState !== "failed") {
    throw new WorkflowError(`Cannot generate scenarios from state ${project.workflowState}`);
  }
  if (!project.requirement) throw new WorkflowError("Missing requirement document");

  if (project.workflowState !== "requirements_approved") {
    project.workflowState = "requirements_approved";
  }
  transition(project, "scenario_generation");
  await saveProject(project);

  try {
    const scenarios = await runScenarioAgent({
      requirementId: project.requirement.id,
      rules: project.requirement.rules,
    });
    project.scenarios = scenarios;
    transition(project, "scenario_review");
    project.lastError = undefined;
  } catch (err) {
    project.lastError = err instanceof Error ? err.message : String(err);
    transition(project, "failed");
  }
  return saveProject(project);
}

export async function approveScenarios(projectId: string, raw: unknown): Promise<Project> {
  const input = ApproveScenariosInputSchema.parse(raw);
  const project = await getProject(projectId);
  if (project.workflowState !== "scenario_review" && project.workflowState !== "failed") {
    throw new WorkflowError(`Cannot approve scenarios from state ${project.workflowState}`);
  }
  if (project.workflowState === "failed") project.workflowState = "scenario_review";

  const statusMap = new Map(input.scenarios.map((s) => [s.id, s.status]));
  project.scenarios = project.scenarios.map((s) => ({
    ...s,
    status: statusMap.get(s.id) || s.status,
  }));

  const approved = project.scenarios.filter((s) => s.status === "approved");
  if (!approved.length) {
    throw new ValidationError("Approve at least one scenario");
  }

  transition(project, "scenarios_approved");
  return saveProject(project);
}

export async function generateTestData(projectId: string): Promise<Project> {
  const project = await getProject(projectId);
  if (project.workflowState !== "scenarios_approved" && project.workflowState !== "failed") {
    throw new WorkflowError(`Cannot generate test data from state ${project.workflowState}`);
  }
  if (project.workflowState === "failed") project.workflowState = "scenarios_approved";

  transition(project, "test_data_generation");
  await saveProject(project);

  try {
    project.fixtures = runTestDataAgent({ scenarios: project.scenarios, seed: 1 });
    transition(project, "test_generation");
    project.lastError = undefined;
  } catch (err) {
    project.lastError = err instanceof Error ? err.message : String(err);
    transition(project, "failed");
  }
  return saveProject(project);
}

export async function generateCollection(projectId: string): Promise<Project> {
  const project = await getProject(projectId);
  if (!project.fixtures.length) {
    throw new WorkflowError("Generate test data before collection generation");
  }
  if (
    !["test_generation", "collection_review", "ready_to_execute", "failed"].includes(
      project.workflowState
    )
  ) {
    throw new WorkflowError(`Cannot generate collection from state ${project.workflowState}`);
  }

  project.workflowState = "test_generation";
  await saveProject(project);

  try {
    const { meta } = await runApiTestAgent({
      projectId: project.id,
      projectName: project.name,
      scenarios: project.scenarios,
      fixtures: project.fixtures,
    });
    project.collection = meta;
    transition(project, "collection_review");
    project.lastError = undefined;
  } catch (err) {
    project.lastError = err instanceof Error ? err.message : String(err);
    transition(project, "failed");
  }
  return saveProject(project);
}

export async function markReadyToExecute(projectId: string): Promise<Project> {
  const project = await getProject(projectId);
  if (project.workflowState !== "collection_review") {
    throw new WorkflowError(`Cannot mark ready from state ${project.workflowState}`);
  }
  if (!project.collection) throw new WorkflowError("No collection available");
  transition(project, "ready_to_execute");
  return saveProject(project);
}

export async function startRun(projectId: string, raw: unknown): Promise<{
  project: Project;
  summary: ExecutionSummary;
}> {
  const input = StartRunInputSchema.parse(raw);
  const project = await getProject(projectId);
  if (!project.collection) throw new WorkflowError("No collection to execute");

  if (project.workflowState === "collection_review") {
    transition(project, "ready_to_execute");
  }
  if (project.workflowState !== "ready_to_execute" && project.workflowState !== "completed" && project.workflowState !== "failed") {
    throw new WorkflowError(`Cannot execute from state ${project.workflowState}`);
  }
  if (project.workflowState === "completed" || project.workflowState === "failed") {
    project.workflowState = "ready_to_execute";
  }

  assertAllowedTarget(input.targetBaseUrl, input.confirmTarget);
  if (input.collectionId !== project.collection.id) {
    throw new ValidationError("collectionId does not match generated collection");
  }

  transition(project, "executing");
  await saveProject(project);

  // Reset mock claim store before each demo run for reproducibility
  try {
    await fetch(`${config.mockApiBaseUrl}/admin/reset`, { method: "POST" });
  } catch {
    /* mock may be same process; ignore */
  }

  const runner = createRunner(input.runner);
  const runId = `RUN-${nanoid(8)}`;
  let summary = await runner.execute({
    runId,
    projectId: project.id,
    collectionId: project.collection.id,
    collectionPath: project.collection.collectionPath,
    environmentPath: project.collection.environmentPath,
    targetBaseUrl: input.targetBaseUrl,
    timeoutMs: config.executionTimeoutMs,
  });

  await saveRun(summary);
  project.runs = [...project.runs, runId];

  if (summary.overallStatus === "error" && !summary.results.length) {
    project.lastError = summary.errorMessage;
    transition(project, "failed");
    await saveProject(project);
    return { project, summary };
  }

  transition(project, "analyzing");
  await saveProject(project);

  try {
    const { findings } = await runAnalysisAgent({
      rules: project.requirement?.rules || [],
      scenarios: project.scenarios,
      summary,
    });
    project.findings = findings;
    transition(project, "completed");
    project.lastError = undefined;
  } catch (err) {
    project.lastError = err instanceof Error ? err.message : String(err);
    transition(project, "failed");
  }

  await saveProject(project);
  return { project, summary };
}

export async function getRunDetails(runId: string): Promise<ExecutionSummary> {
  return getRun(runId);
}

export async function getDashboardStats() {
  const projects = await listProjects();
  let scenariosGenerated = 0;
  let scenariosApproved = 0;
  let testsExecuted = 0;
  let passed = 0;
  let failed = 0;
  let potentialDefects = 0;
  const recentRuns: Array<{ projectId: string; projectName: string; runId: string }> = [];

  for (const p of projects) {
    scenariosGenerated += p.scenarios.length;
    scenariosApproved += p.scenarios.filter((s) => s.status === "approved").length;
    potentialDefects += p.findings.filter(
      (f) => f.classification === "potential_business_rule_defect"
    ).length;
    for (const runId of p.runs.slice(-5)) {
      recentRuns.push({ projectId: p.id, projectName: p.name, runId });
      try {
        const run = await getRun(runId);
        testsExecuted += run.totalTests;
        passed += run.passed;
        failed += run.failed;
      } catch {
        /* ignore missing */
      }
    }
  }

  return {
    projectCount: projects.length,
    requirementsAnalyzed: projects.filter((p) => p.requirement).length,
    scenariosGenerated,
    scenariosApproved,
    testsExecuted,
    passed,
    failed,
    potentialDefects,
    recentRuns: recentRuns.slice(-10).reverse(),
  };
}

export function buildReport(project: Project, summary?: ExecutionSummary) {
  return {
    projectId: project.id,
    projectName: project.name,
    workflowState: project.workflowState,
    requirementSummary: project.requirement
      ? {
          id: project.requirement.id,
          title: project.requirement.title,
          ruleCount: project.requirement.rules.length,
          assumptions: project.requirement.assumptions,
          openQuestions: project.requirement.openQuestions,
        }
      : null,
    approvedBusinessRules:
      project.requirement?.rules.filter((r) => r.status === "approved") || [],
    scenarioCount: project.scenarios.length,
    scenarioCoverageByRule: coverageByRule(project),
    execution: summary
      ? {
          runId: summary.runId,
          overallStatus: summary.overallStatus,
          totalTests: summary.totalTests,
          passed: summary.passed,
          failed: summary.failed,
          runnerName: summary.runnerName,
          runnerVersion: summary.runnerVersion,
          targetBaseUrl: summary.targetBaseUrl,
        }
      : null,
    findings: project.findings,
    notice:
      "Failed validation tests indicate unexpected software behavior; they do not establish that a real insurance claim is fraudulent.",
    generatedAt: now(),
  };
}

function coverageByRule(project: Project): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const scenario of project.scenarios) {
    for (const ruleId of scenario.businessRuleIds) {
      map[ruleId] = map[ruleId] || [];
      map[ruleId].push(scenario.id);
    }
  }
  return map;
}

/** Interactive flow: paste requirement → analyze (no separate project create step). */
export async function analyzeFromRequirement(raw: unknown): Promise<Project> {
  const input = CreateProjectInputSchema.parse({
    name: (raw as { name?: string })?.name || `Life claim analysis ${new Date().toISOString().slice(0, 16)}`,
    productType: (raw as { productType?: string })?.productType || "life",
    requirementText: (raw as { requirementText?: string })?.requirementText,
    apiSpecText: (raw as { apiSpecText?: string })?.apiSpecText,
    executionMode: (raw as { executionMode?: string })?.executionMode || "mock",
  });
  const created = await createProject(input);
  return analyzeRequirements(created.id);
}

/** Approve selected rules and generate scenarios in one step. */
export async function approveRulesAndGenerateScenarios(
  projectId: string,
  raw: unknown
): Promise<Project> {
  await approveRequirements(projectId, raw);
  return generateScenarios(projectId);
}

/** Approve selected scenarios, then run Test Data Agent (fixtures only). */
export async function approveScenariosAndGenerateTestData(
  projectId: string,
  raw: unknown
): Promise<Project> {
  await approveScenarios(projectId, raw);
  return generateTestData(projectId);
}

/** API Test Agent: Postman collection + Newman execution (+ analysis). */
export async function runApiTestAgentStage(
  projectId: string
): Promise<{ project: Project; summary: ExecutionSummary }> {
  let project = await getProject(projectId);
  if (!project.fixtures.length) {
    throw new WorkflowError("Generate test data before API Test Agent");
  }
  if (
    !["test_generation", "collection_review", "ready_to_execute", "completed", "failed"].includes(
      project.workflowState
    )
  ) {
    throw new WorkflowError(`Cannot run API Test Agent from state ${project.workflowState}`);
  }
  project = await generateCollection(project.id);
  project = await markReadyToExecute(project.id);
  return startRun(project.id, {
    collectionId: project.collection!.id,
    targetBaseUrl: config.mockApiBaseUrl,
    confirmTarget: true,
    runner: "newman",
  });
}

/** Full pipeline helper used by scripts/tests. */
export async function approveScenariosAndRunTests(
  projectId: string,
  raw: unknown
): Promise<{ project: Project; summary: ExecutionSummary }> {
  await approveScenariosAndGenerateTestData(projectId, raw);
  return runApiTestAgentStage(projectId);
}

export function buildDependencyView(project: Project) {
  const req = project.requirement;
  if (!req) {
    return { rules: [], fields: [], openQuestions: [], assumptions: [], edges: [] };
  }

  const edges: Array<{ from: string; to: string; kind: string }> = [];
  for (const q of req.openQuestions) {
    for (const ruleId of q.relatedRuleIds) {
      edges.push({ from: q.id, to: ruleId, kind: "question_about" });
    }
  }
  for (const field of req.requiredFields) {
    const related = req.rules
      .filter(
        (r) =>
          r.condition.toLowerCase().includes(field.name.toLowerCase()) ||
          r.description.toLowerCase().includes(field.name.toLowerCase())
      )
      .map((r) => r.id);
    for (const ruleId of related) {
      edges.push({ from: field.name, to: ruleId, kind: "field_validates" });
    }
  }

  return {
    title: req.title,
    sourceText: req.sourceText,
    rules: req.rules,
    suggestedRules: req.suggestedRules || [],
    fields: req.requiredFields,
    openQuestions: req.openQuestions,
    assumptions: req.assumptions,
    edges,
    expectedSuccessBehavior: req.expectedSuccessBehavior,
    expectedRejectionBehavior: req.expectedRejectionBehavior,
  };
}
