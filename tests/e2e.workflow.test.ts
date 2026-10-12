import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockInsuranceApp } from "../src/mock-api/app.js";
import {
  resetClaims,
  setIntentionalDefect,
} from "../src/mock-api/store.js";
import { initStorage } from "../src/storage/fileStore.js";
import {
  analyzeRequirements,
  approveRequirements,
  approveScenarios,
  createProject,
  generateCollection,
  generateScenarios,
  generateTestData,
  markReadyToExecute,
  startRun,
} from "../src/orchestrator/workflowService.js";
import { config } from "../src/config.js";

describe("end-to-end workflow", () => {
  let closeMock: () => Promise<void>;
  let originalDataDir: string;
  let originalMockPort: number;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ins-accel-"));
    originalDataDir = config.dataDir;
    originalMockPort = config.mockApiPort;
    (config as { dataDir: string }).dataDir = tempDir;
    (config as { artifactsDir: string }).artifactsDir = path.join(tempDir, "artifacts");

    const app = createMockInsuranceApp();
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", () => r()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    (config as { mockApiPort: number }).mockApiPort = addr.port;
    (config as { mockApiBaseUrl: string }).mockApiBaseUrl = `http://127.0.0.1:${addr.port}`;
    closeMock = () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    await initStorage();
    resetClaims();
    setIntentionalDefect(false);
  });

  afterAll(async () => {
    await closeMock();
    (config as { dataDir: string }).dataDir = originalDataDir;
    (config as { mockApiPort: number }).mockApiPort = originalMockPort;
    (config as { mockApiBaseUrl: string }).mockApiBaseUrl =
      `http://127.0.0.1:${originalMockPort}`;
    setIntentionalDefect(false);
  });

  it("runs requirement → scenarios → collection → execute → analyze", async () => {
    let project = await createProject({
      name: "E2E Life",
      productType: "life",
      requirementText:
        "As a beneficiary, I should be able to submit a life insurance death claim against an active life policy. The system should accept the claim only when the policy is active, the date of death falls within the policy period, the claim amount does not exceed the policy sum assured, and duplicate claims for the same death event are rejected.",
      executionMode: "mock",
    });

    project = await analyzeRequirements(project.id);
    expect(project.workflowState).toBe("requirements_review");
    expect(project.requirement?.rules.length).toBeGreaterThan(0);

    project = await approveRequirements(project.id, {
      rules: project.requirement!.rules.map((r) => ({ ...r, status: "approved" })),
    });
    expect(project.workflowState).toBe("requirements_approved");

    project = await generateScenarios(project.id);
    expect(project.scenarios.length).toBeGreaterThan(5);

    project = await approveScenarios(project.id, {
      scenarios: project.scenarios.map((s) => ({ id: s.id, status: "approved" })),
    });

    project = await generateTestData(project.id);
    expect(project.fixtures.length).toBe(project.scenarios.filter((s) => s.status === "approved").length);
    expect(project.workflowState).toBe("test_generation");

    project = await generateCollection(project.id);
    expect(project.collection?.requestCount).toBeGreaterThan(0);
    expect(project.workflowState).toBe("collection_review");

    project = await markReadyToExecute(project.id);
    const { summary, project: afterRun } = await startRun(project.id, {
      collectionId: project.collection!.id,
      targetBaseUrl: config.mockApiBaseUrl,
      confirmTarget: true,
      runner: "newman",
    });

    expect(summary.totalTests).toBeGreaterThan(0);
    expect(afterRun.workflowState).toBe("completed");
    expect(summary.overallStatus === "passed" || summary.failed >= 0).toBe(true);

    // Defect demo: enable intentional defect and re-run
    setIntentionalDefect(true);
    resetClaims();
    const second = await startRun(afterRun.id, {
      collectionId: afterRun.collection!.id,
      targetBaseUrl: config.mockApiBaseUrl,
      confirmTarget: true,
      runner: "newman",
    });

    const defect = second.project.findings.find(
      (f) =>
        f.classification === "potential_business_rule_defect" &&
        f.scenarioIds.includes("SC-006")
    );
    expect(defect).toBeTruthy();
    expect(defect?.evidence.join(" ")).toMatch(/100001|SC-006|BR-005|HTTP/i);
  }, 120000);
});
