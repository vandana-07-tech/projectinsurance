import { describe, expect, it } from "vitest";
import { runRequirementAgent } from "../src/agents/requirementAgent.js";
import { runScenarioAgent } from "../src/agents/scenarioAgent.js";
import { runTestDataAgent } from "../src/agents/testDataAgent.js";
import { runAnalysisAgent } from "../src/agents/analysisAgent.js";
import type { ExecutionSummary, TestScenario } from "../src/shared/schemas.js";

describe("agents (mock LLM)", () => {
  it("extracts structured rules and open questions", async () => {
    const doc = await runRequirementAgent({
      requirementText:
        "Submit life insurance death claim only when policy is active, date of death in period, amount within sum assured, no duplicates.",
      productType: "life",
      title: "Life demo",
    });
    expect(doc.rules.length).toBeGreaterThanOrEqual(5);
    expect(doc.openQuestions.length).toBeGreaterThan(0);
    expect(doc.assumptions.length).toBeGreaterThan(0);
    expect(doc.status).toBe("needs_review");
  });

  it("generates scenarios mapped to approved rules", async () => {
    const doc = await runRequirementAgent({
      requirementText: "Life claim rules for active policy and sum assured limits.",
      productType: "life",
    });
    const approved = doc.rules.map((r) => ({ ...r, status: "approved" as const }));
    const scenarios = await runScenarioAgent({
      requirementId: doc.id,
      rules: approved,
    });
    expect(scenarios.some((s) => s.category === "positive")).toBe(true);
    expect(scenarios.some((s) => s.category === "boundary")).toBe(true);
    expect(scenarios.every((s) => s.businessRuleIds.length > 0)).toBe(true);
  });

  it("builds synthetic fixtures linked to scenarios", async () => {
    const scenarios: TestScenario[] = [
      {
        id: "SC-001",
        name: "Valid",
        category: "positive",
        description: "ok",
        requirementIds: ["REQ-1"],
        businessRuleIds: ["BR-001"],
        preconditions: [],
        inputOverrides: { claimAmount: 50000 },
        expectedOutcome: "accept",
        expectedStatusCodes: [201],
        priority: "high",
        requiresHumanReview: false,
        status: "approved",
      },
      {
        id: "SC-006",
        name: "Over limit",
        category: "boundary",
        description: "over",
        requirementIds: ["REQ-1"],
        businessRuleIds: ["BR-005"],
        preconditions: [],
        inputOverrides: { claimAmount: 100001 },
        expectedOutcome: "reject",
        expectedStatusCodes: [400],
        priority: "critical",
        requiresHumanReview: false,
        status: "approved",
      },
    ];
    const fixtures = runTestDataAgent({ scenarios, seed: 1 });
    expect(fixtures).toHaveLength(2);
    expect(fixtures[0].synthetic).toBe(true);
    expect(fixtures[0].requestPayload.claimAmount).toBe(50000);
    expect(fixtures[1].requestPayload.claimAmount).toBe(100001);
  });

  it("flags over-limit accept as potential defect", async () => {
    const summary: ExecutionSummary = {
      runId: "RUN-1",
      projectId: "PRJ-1",
      collectionId: "COL-1",
      runnerName: "newman",
      targetBaseUrl: "http://127.0.0.1:3001",
      startedAt: new Date().toISOString(),
      overallStatus: "failed",
      totalTests: 1,
      passed: 0,
      failed: 1,
      results: [
        {
          runId: "RUN-1",
          scenarioId: "SC-006",
          requestName: "SC-006 — over",
          status: "assertion_failed",
          httpStatus: 201,
          assertionResults: [{ name: "status", passed: false, error: "expected 400" }],
          sanitizedEvidence: { responseBody: { status: "ACCEPTED" } },
        },
      ],
    };

    const { findings } = await runAnalysisAgent({
      rules: [
        {
          id: "BR-005",
          description: "limit",
          category: "amount",
          condition: "claimAmount <= limit",
          expectedBehavior: "Reject over-limit",
          source: "explicit_requirement",
          status: "approved",
        },
      ],
      scenarios: [
        {
          id: "SC-006",
          name: "Over limit",
          category: "boundary",
          description: "over",
          requirementIds: ["REQ-1"],
          businessRuleIds: ["BR-005"],
          preconditions: [],
          inputOverrides: { claimAmount: 100001 },
          expectedOutcome: "reject",
          expectedStatusCodes: [400],
          priority: "critical",
          requiresHumanReview: false,
          status: "approved",
        },
      ],
      summary,
    });

    expect(findings[0].classification).toBe("potential_business_rule_defect");
    expect(findings[0].scenarioIds).toContain("SC-006");
  });
});
