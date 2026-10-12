import { z } from "zod";
import { nanoid } from "nanoid";
import { getLlmProvider } from "../llm/provider.js";
import {
  BusinessRuleSchema,
  OpenQuestionSchema,
  RequiredFieldSchema,
  type RequirementDocument,
} from "../shared/schemas.js";
import { ValidationError } from "../shared/errors.js";
import { REQUIREMENT_SYSTEM } from "./prompts.js";

const AgentOutputSchema = z.object({
  title: z.string(),
  productType: z.string(),
  rules: z.array(BusinessRuleSchema),
  suggestedRules: z.array(BusinessRuleSchema).default([]),
  requiredFields: z.array(RequiredFieldSchema).default([]),
  openQuestions: z.array(OpenQuestionSchema).default([]),
  assumptions: z.array(z.string()).default([]),
  expectedSuccessBehavior: z.string().optional(),
  expectedRejectionBehavior: z.string().optional(),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
});

export async function runRequirementAgent(input: {
  requirementText: string;
  productType: string;
  apiSpecText?: string;
  title?: string;
}): Promise<RequirementDocument> {
  const provider = getLlmProvider();
  const userPrompt = [
    `Title: ${input.title || "Life Insurance Death Claim Submission"}`,
    `ProductType: ${input.productType}`,
    `Requirement:`,
    input.requirementText,
    input.apiSpecText ? `API Spec:\n${input.apiSpecText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await provider.complete({
    agentName: "RequirementAgent",
    systemPrompt: REQUIREMENT_SYSTEM,
    userPrompt,
    schema: AgentOutputSchema,
  });

  if (!result.data.rules.length) {
    throw new ValidationError("Requirement Agent returned no business rules");
  }

  const now = new Date().toISOString();
  return {
    id: `REQ-${nanoid(8)}`,
    title: result.data.title,
    productType: result.data.productType || input.productType,
    sourceText: input.requirementText,
    rules: result.data.rules,
    suggestedRules: result.data.suggestedRules || [],
    requiredFields: result.data.requiredFields,
    openQuestions: result.data.openQuestions,
    assumptions: result.data.assumptions,
    expectedSuccessBehavior: result.data.expectedSuccessBehavior,
    expectedRejectionBehavior: result.data.expectedRejectionBehavior,
    confidence: result.data.confidence,
    status: "needs_review",
    createdAt: now,
    updatedAt: now,
  };
}
