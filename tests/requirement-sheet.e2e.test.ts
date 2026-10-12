import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockInsuranceApp } from "../src/mock-api/app.js";
import { resetClaims, setIntentionalDefect } from "../src/mock-api/store.js";
import { initStorage } from "../src/storage/fileStore.js";
import { config } from "../src/config.js";
import { REQUIREMENT_SHEET } from "../src/shared/requirementCatalog.js";
import {
  analyzeFromRequirement,
  approveRulesAndGenerateScenarios,
  approveScenariosAndRunTests,
} from "../src/orchestrator/workflowService.js";

describe("requirement sheet E2E (all 6)", () => {
  let closeMock: () => Promise<void>;
  let originalDataDir: string;
  let originalMockPort: number;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ins-sheet-"));
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
    setIntentionalDefect(false);
  });

  afterAll(async () => {
    await closeMock();
    (config as { dataDir: string }).dataDir = originalDataDir;
    (config as { mockApiPort: number }).mockApiPort = originalMockPort;
    (config as { mockApiBaseUrl: string }).mockApiBaseUrl =
      `http://127.0.0.1:${originalMockPort}`;
  });

  it("has exactly 6 catalog requirements", () => {
    expect(REQUIREMENT_SHEET).toHaveLength(6);
  });

  for (const catalog of REQUIREMENT_SHEET) {
    it(`E2E pipeline for ${catalog.id}: ${catalog.title}`, async () => {
      resetClaims();
      setIntentionalDefect(false);

      let project = await analyzeFromRequirement({
        name: `Sheet ${catalog.id}`,
        productType: "life",
        requirementText: catalog.text,
        executionMode: "mock",
      });

      expect(project.requirement?.rules.length).toBeGreaterThan(0);
      expect(project.requirement?.suggestedRules?.length).toBeGreaterThan(0);

      project = await approveRulesAndGenerateScenarios(project.id, {
        rules: project.requirement!.rules.map((r) => ({ ...r, status: "approved" })),
      });
      expect(project.scenarios.length).toBeGreaterThan(0);

      // Unselected-rule logic simulation: reject BR-005 if present → scenarios needing it should be rejectable
      const hasAmountRule = project.requirement!.rules.some((r) => r.id === "BR-005");
      if (hasAmountRule) {
        const dependent = project.scenarios.filter((s) => s.businessRuleIds.includes("BR-005"));
        expect(dependent.length).toBeGreaterThan(0);
      }

      const { summary, project: after } = await approveScenariosAndRunTests(project.id, {
        scenarios: project.scenarios.map((s) => ({ id: s.id, status: "approved" })),
      });

      expect(summary.totalTests).toBeGreaterThan(0);
      expect(after.workflowState).toBe("completed");
      // Allow failures only as assertion mismatches — pipeline must finish
      expect(["passed", "failed"]).toContain(summary.overallStatus);
    }, 180000);
  }
});
