import { describe, expect, it } from "vitest";
import {
  BusinessRuleSchema,
  TestScenarioSchema,
  TestFixtureSchema,
  FindingSchema,
} from "../src/shared/schemas.js";
import { canTransition } from "../src/shared/workflow.js";
import { redactObject } from "../src/shared/redact.js";

describe("schemas", () => {
  it("rejects invalid business rules", () => {
    const result = BusinessRuleSchema.safeParse({
      id: "",
      description: "x",
      category: "c",
      condition: "c",
      expectedBehavior: "e",
      source: "explicit_requirement",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid scenario", () => {
    const result = TestScenarioSchema.safeParse({
      id: "SC-001",
      name: "Valid",
      category: "positive",
      description: "ok",
      businessRuleIds: ["BR-001"],
      expectedOutcome: "accept",
    });
    expect(result.success).toBe(true);
  });

  it("requires synthetic true on fixtures", () => {
    const result = TestFixtureSchema.safeParse({
      id: "FIX-1",
      scenarioId: "SC-001",
      synthetic: false,
      entities: {},
      requestPayload: {},
    });
    expect(result.success).toBe(false);
  });

  it("validates finding classification", () => {
    const result = FindingSchema.safeParse({
      id: "FND-1",
      title: "Over limit accepted",
      category: "boundary",
      severity: "high",
      confidence: "high",
      classification: "potential_business_rule_defect",
      scenarioIds: ["SC-006"],
      businessRuleIds: ["BR-005"],
      expectedBehavior: "reject",
      actualBehavior: "accept",
      evidence: ["HTTP 201"],
      reproductionSteps: ["POST /api/claims"],
      recommendation: "Investigate limit validation",
    });
    expect(result.success).toBe(true);
  });
});

describe("workflow", () => {
  it("allows draft to requirements_processing", () => {
    expect(canTransition("draft", "requirements_processing")).toBe(true);
  });

  it("blocks skipping approvals", () => {
    expect(canTransition("draft", "executing")).toBe(false);
  });
});

describe("redact", () => {
  it("redacts secrets", () => {
    const out = redactObject({
      authorization: "Bearer secret",
      nested: { apiKey: "abc", ok: 1 },
    });
    expect(out.authorization).toBe("[REDACTED]");
    expect((out.nested as { apiKey: string }).apiKey).toBe("[REDACTED]");
    expect((out.nested as { ok: number }).ok).toBe(1);
  });
});
