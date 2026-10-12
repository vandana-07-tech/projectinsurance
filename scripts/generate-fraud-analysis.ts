/**
 * One-shot: requirement → rules → scenarios → execute → fraud analysis report
 */
import { createMockInsuranceApp } from "../src/mock-api/app.js";
import {
  resetClaims,
  setIntentionalDefect,
} from "../src/mock-api/store.js";
import { config } from "../src/config.js";
import { initStorage } from "../src/storage/fileStore.js";
import {
  analyzeFromRequirement,
  approveRulesAndGenerateScenarios,
  approveScenariosAndRunTests,
  buildDependencyView,
  buildReport,
  startRun,
} from "../src/orchestrator/workflowService.js";

const REQUIREMENT = `As a beneficiary, I should be able to submit a life insurance death claim against an active life policy. The system should accept the claim only when the policy is active, the date of death falls within the policy period, the claim amount does not exceed the policy sum assured, and duplicate claims for the same death event are rejected.`;

async function main() {
  await initStorage();

  const app = createMockInsuranceApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  (config as { mockApiPort: number }).mockApiPort = addr.port;
  (config as { mockApiBaseUrl: string }).mockApiBaseUrl = `http://127.0.0.1:${addr.port}`;

  resetClaims();
  setIntentionalDefect(false);

  console.log("=== 1. Requirement ===\n");
  console.log(REQUIREMENT);

  let project = await analyzeFromRequirement({
    requirementText: REQUIREMENT,
    productType: "life",
    executionMode: "mock",
    name: "Life fraud analysis run",
  });

  const deps = buildDependencyView(project);
  console.log("\n=== 2. Extracted business rules ===\n");
  for (const r of deps.rules) {
    console.log(`${r.id} [${r.category}] ${r.description}`);
    console.log(`   condition: ${r.condition}`);
    console.log(`   expected:  ${r.expectedBehavior}`);
  }

  console.log("\n=== 3. Dependencies / open questions ===\n");
  for (const q of deps.openQuestions) {
    console.log(`${q.id}: ${q.question} → ${(q.relatedRuleIds || []).join(", ")}`);
  }
  console.log("\nAssumptions:");
  for (const a of deps.assumptions) console.log(`- ${a}`);

  project = await approveRulesAndGenerateScenarios(project.id, {
    rules: project.requirement!.rules.map((r) => ({ ...r, status: "approved" })),
  });

  console.log("\n=== 4. Generated scenarios ===\n");
  for (const s of project.scenarios) {
    console.log(
      `${s.id} | ${s.category.padEnd(16)} | ${s.expectedOutcome.padEnd(8)} | ${s.name} → ${s.businessRuleIds.join(",")}`
    );
  }

  // Baseline run (rules enforced)
  const baseline = await approveScenariosAndRunTests(project.id, {
    scenarios: project.scenarios.map((s) => ({ id: s.id, status: "approved" })),
  });

  console.log("\n=== 5. Baseline execution (defect mode OFF) ===\n");
  console.log(
    `Run ${baseline.summary.runId}: ${baseline.summary.overallStatus} — ${baseline.summary.passed}/${baseline.summary.totalTests} passed`
  );

  // Defect demo run (re-execute same collection with intentional defect enabled)
  setIntentionalDefect(true);
  resetClaims();
  const defectRun = await startRun(baseline.project.id, {
    collectionId: baseline.project.collection!.id,
    targetBaseUrl: config.mockApiBaseUrl,
    confirmTarget: true,
    runner: "newman",
  });

  console.log("\n=== 6. Fraud analysis (intentional defect ON — over-limit accepted) ===\n");
  console.log(
    `Run ${defectRun.summary.runId}: ${defectRun.summary.overallStatus} — ${defectRun.summary.passed}/${defectRun.summary.totalTests} passed`
  );

  const report = buildReport(defectRun.project, defectRun.summary);
  console.log("\n--- Findings ---\n");
  if (!report.findings.length) {
    console.log("No findings.");
  }
  for (const f of report.findings) {
    console.log(`Finding: ${f.id}`);
    console.log(`Title:   ${f.title}`);
    console.log(`Class:   ${f.classification}`);
    console.log(`Severity/Confidence: ${f.severity} / ${f.confidence}`);
    console.log(`Rules:   ${f.businessRuleIds.join(", ")}`);
    console.log(`Scenarios: ${f.scenarioIds.join(", ")}`);
    console.log(`Expected: ${f.expectedBehavior}`);
    console.log(`Actual:   ${f.actualBehavior}`);
    console.log("Evidence:");
    for (const e of f.evidence) console.log(`  - ${e}`);
    console.log("Reproduction:");
    for (const step of f.reproductionSteps) console.log(`  - ${step}`);
    console.log(`Recommendation: ${f.recommendation}`);
    console.log("");
  }

  console.log("--- Notice ---");
  console.log(report.notice);

  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  setIntentionalDefect(false);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
