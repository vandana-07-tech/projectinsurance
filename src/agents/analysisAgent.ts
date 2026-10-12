import { nanoid } from "nanoid";
import { z } from "zod";
import { getLlmProvider } from "../llm/provider.js";
import type {
  BusinessRule,
  ExecutionResult,
  ExecutionSummary,
  Finding,
  TestScenario,
} from "../shared/schemas.js";
import { FindingSchema } from "../shared/schemas.js";
import { ANALYSIS_SYSTEM } from "./prompts.js";

const NarrativeSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()).default([]),
});

export async function runAnalysisAgent(input: {
  rules: BusinessRule[];
  scenarios: TestScenario[];
  summary: ExecutionSummary;
}): Promise<{ findings: Finding[]; narrative: z.infer<typeof NarrativeSchema> }> {
  const scenarioMap = new Map(input.scenarios.map((s) => [s.id, s]));
  const ruleMap = new Map(input.rules.map((r) => [r.id, r]));
  const findings: Finding[] = [];

  for (const result of input.summary.results) {
    const scenario = result.scenarioId ? scenarioMap.get(result.scenarioId) : undefined;

    if (result.status === "timed_out" || result.status === "request_failed") {
      findings.push(
        makeFinding({
          title: `Infrastructure issue for ${result.requestName}`,
          category: "infrastructure",
          severity: "medium",
          confidence: "high",
          classification: "test_infrastructure_failure",
          scenarioIds: result.scenarioId ? [result.scenarioId] : [],
          businessRuleIds: scenario?.businessRuleIds || [],
          expectedBehavior: scenario?.expectedOutcome || "request completes",
          actualBehavior: result.errorMessage || result.status,
          evidence: evidenceFrom(result),
          reproductionSteps: [
            `Re-run request "${result.requestName}" against ${input.summary.targetBaseUrl}`,
            "Confirm mock API / target is reachable",
          ],
          recommendation: "Fix runner/target connectivity before interpreting business outcomes.",
        })
      );
      continue;
    }

    if (result.status === "passed") continue;

    if (!scenario) {
      findings.push(
        makeFinding({
          title: `Inconclusive result for ${result.requestName}`,
          category: "traceability",
          severity: "low",
          confidence: "low",
          classification: "inconclusive",
          scenarioIds: [],
          businessRuleIds: [],
          expectedBehavior: "Traceable scenario mapping",
          actualBehavior: "Scenario ID missing or unknown",
          evidence: evidenceFrom(result),
          reproductionSteps: [`Inspect request ${result.requestName}`],
          recommendation: "Restore scenario-to-request mapping and re-run.",
        })
      );
      continue;
    }

    const overLimitAccepted =
      scenario.id === "SC-006" &&
      result.httpStatus !== undefined &&
      result.httpStatus >= 200 &&
      result.httpStatus < 300;

    const unexpectedSuccess =
      scenario.expectedOutcome === "reject" &&
      result.httpStatus !== undefined &&
      result.httpStatus >= 200 &&
      result.httpStatus < 300;

    const unexpectedReject =
      scenario.expectedOutcome === "accept" &&
      result.httpStatus !== undefined &&
      result.httpStatus >= 400;

    const classification = overLimitAccepted || unexpectedSuccess || unexpectedReject
      ? "potential_business_rule_defect"
      : result.status === "assertion_failed"
        ? "api_contract_mismatch"
        : "inconclusive";

    const primaryRule = scenario.businessRuleIds[0];
    const rule = primaryRule ? ruleMap.get(primaryRule) : undefined;

    findings.push(
      makeFinding({
        title: overLimitAccepted
          ? "Coverage limit may not be enforced (over-limit claim accepted)"
          : `Outcome mismatch for ${scenario.id}`,
        category: scenario.category,
        severity: overLimitAccepted ? "high" : scenario.priority,
        confidence: scenario.requiresHumanReview ? "low" : "high",
        classification: scenario.requiresHumanReview ? "inconclusive" : classification,
        scenarioIds: [scenario.id],
        businessRuleIds: scenario.businessRuleIds,
        expectedBehavior:
          rule?.expectedBehavior ||
          `${scenario.expectedOutcome} with statuses ${JSON.stringify(scenario.expectedStatusCodes || [])}`,
        actualBehavior: `HTTP ${result.httpStatus ?? "n/a"}; status=${result.status}`,
        evidence: [
          ...evidenceFrom(result),
          `Scenario: ${scenario.id} — ${scenario.name}`,
          `Business rules: ${scenario.businessRuleIds.join(", ")}`,
          `Expected outcome: ${scenario.expectedOutcome}`,
        ],
        reproductionSteps: [
          `Use synthetic payload from scenario ${scenario.id}`,
          `POST ${input.summary.targetBaseUrl}/api/claims`,
          `Expect ${scenario.expectedOutcome}; observe HTTP ${result.httpStatus ?? "n/a"}`,
        ],
        recommendation: overLimitAccepted
          ? "Investigate claim amount vs coverageLimit validation. Treat as potential business-rule validation defect until confirmed."
          : "Compare API response with approved rule and mock contract; confirm before filing a defect.",
      })
    );
  }

  const failedCount = input.summary.results.filter((r) => r.status !== "passed").length;
  const defectHint = findings.some(
    (f) =>
      f.classification === "potential_business_rule_defect" &&
      f.scenarioIds.includes("SC-006")
  );

  const narrative = await getLlmProvider().complete({
    agentName: "FraudAnalysisAgent",
    systemPrompt: ANALYSIS_SYSTEM,
    userPrompt: [
      `FAILED_COUNT:${failedCount}`,
      defectHint ? "DEFECT_HINT:over_limit_accepted" : "DEFECT_HINT:none",
      `RUN:${input.summary.runId}`,
      `FINDINGS:${findings.length}`,
    ].join("\n"),
    schema: NarrativeSchema,
  });

  return { findings, narrative: narrative.data };
}

function evidenceFrom(result: ExecutionResult): string[] {
  const evidence: string[] = [
    `Request: ${result.requestName}`,
    `Result status: ${result.status}`,
  ];
  if (result.httpStatus !== undefined) evidence.push(`HTTP status: ${result.httpStatus}`);
  if (result.responseTimeMs !== undefined) {
    evidence.push(`Response time ms: ${result.responseTimeMs}`);
  }
  if (result.errorMessage) evidence.push(`Error: ${result.errorMessage}`);
  if (result.sanitizedEvidence?.responseBody) {
    evidence.push(`Response body: ${JSON.stringify(result.sanitizedEvidence.responseBody)}`);
  }
  for (const a of result.assertionResults) {
    evidence.push(`Assertion "${a.name}": ${a.passed ? "passed" : `failed (${a.error || ""})`}`);
  }
  return evidence;
}

function makeFinding(partial: Omit<Finding, "id" | "status">): Finding {
  const finding: Finding = {
    id: `FND-${nanoid(8)}`,
    status: "open",
    ...partial,
  };
  return FindingSchema.parse(finding);
}
