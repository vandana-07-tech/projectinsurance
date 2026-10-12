import { z } from "zod";
import { getLlmProvider } from "../llm/provider.js";
import { TestScenarioSchema, type BusinessRule, type TestScenario } from "../shared/schemas.js";
import { ValidationError } from "../shared/errors.js";
import { SCENARIO_SYSTEM } from "./prompts.js";

const AgentOutputSchema = z.object({
  scenarios: z.array(TestScenarioSchema),
});

export async function runScenarioAgent(input: {
  requirementId: string;
  rules: BusinessRule[];
}): Promise<TestScenario[]> {
  const approved = input.rules.filter((r) => r.status === "approved");
  if (!approved.length) {
    throw new ValidationError("No approved business rules available for scenario generation");
  }

  const userPrompt = [
    `RequirementId: ${input.requirementId}`,
    `ApprovedRules:`,
    ...approved.map((r) => `${r.id}: ${r.description} | ${r.condition} | ${r.expectedBehavior}`),
    `API Contract (mock): accept=201, validation reject=400, duplicate=409`,
    `Duplicate key: policyNumber + insuredPersonId + dateOfDeath`,
  ].join("\n");

  const result = await getLlmProvider().complete({
    agentName: "FraudScenarioAgent",
    systemPrompt: SCENARIO_SYSTEM,
    userPrompt,
    schema: AgentOutputSchema,
  });

  const ruleIdSet = new Set(approved.map((r) => r.id));
  const scenarios = result.data.scenarios.map((s) => ({
    ...s,
    requirementIds: s.requirementIds.length ? s.requirementIds : [input.requirementId],
    businessRuleIds: s.businessRuleIds.filter((id) => ruleIdSet.has(id)),
  }));

  for (const scenario of scenarios) {
    if (!scenario.businessRuleIds.length) {
      throw new ValidationError(
        `Scenario ${scenario.id} references no valid approved business rules`
      );
    }
  }

  if (!scenarios.length) {
    throw new ValidationError("Scenario Agent returned no scenarios");
  }

  return scenarios;
}
