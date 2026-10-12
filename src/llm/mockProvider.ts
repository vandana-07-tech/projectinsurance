import type { z } from "zod";
import { ValidationError } from "../shared/errors.js";
import type { LlmProvider, LlmRequest, LlmResponse } from "./types.js";
import { mockRequirementOutput } from "./fixtures/requirement.js";
import { mockScenarioOutput } from "./fixtures/scenarios.js";
import { mockAnalysisNarrative } from "./fixtures/analysis.js";

/**
 * Deterministic demo provider — no external API key required.
 * Routes by agentName and returns schema-validated structured data.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";

  async complete<TSchema extends z.ZodTypeAny>(
    request: LlmRequest<TSchema>
  ): Promise<LlmResponse<z.infer<TSchema>>> {
    let payload: unknown;

    switch (request.agentName) {
      case "RequirementAgent":
        payload = mockRequirementOutput(request.userPrompt);
        break;
      case "FraudScenarioAgent":
        payload = mockScenarioOutput(request.userPrompt);
        break;
      case "FraudAnalysisAgent":
        payload = mockAnalysisNarrative(request.userPrompt);
        break;
      default:
        throw new ValidationError(`Mock provider has no fixture for agent: ${request.agentName}`);
    }

    const parsed = request.schema.safeParse(payload);
    if (!parsed.success) {
      throw new ValidationError("Mock LLM output failed schema validation", parsed.error.flatten());
    }

    return {
      data: parsed.data,
      provider: this.name,
      model: "deterministic-demo-v1",
      rawText: JSON.stringify(payload),
    };
  }
}
