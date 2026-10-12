import { z } from "zod";

export const WorkflowStateSchema = z.enum([
  "draft",
  "requirements_processing",
  "requirements_review",
  "requirements_approved",
  "scenario_generation",
  "scenario_review",
  "scenarios_approved",
  "test_data_generation",
  "test_generation",
  "collection_review",
  "ready_to_execute",
  "executing",
  "analyzing",
  "completed",
  "failed",
  "cancelled",
]);

export const BusinessRuleSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  condition: z.string().min(1),
  expectedBehavior: z.string().min(1),
  source: z.enum(["explicit_requirement", "approved_assumption"]),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["draft", "approved", "rejected"]).default("draft"),
});

export const OpenQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  relatedRuleIds: z.array(z.string()).default([]),
  resolution: z.string().optional(),
});

export const RequiredFieldSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  required: z.boolean(),
  description: z.string().optional(),
});

export const RequirementDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  productType: z.string(),
  sourceText: z.string(),
  rules: z.array(BusinessRuleSchema),
  suggestedRules: z.array(BusinessRuleSchema).default([]),
  requiredFields: z.array(RequiredFieldSchema).default([]),
  openQuestions: z.array(OpenQuestionSchema).default([]),
  assumptions: z.array(z.string()).default([]),
  expectedSuccessBehavior: z.string().optional(),
  expectedRejectionBehavior: z.string().optional(),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  status: z.enum(["draft", "needs_review", "approved"]).default("draft"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TestScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum([
    "positive",
    "negative",
    "boundary",
    "missing_field",
    "invalid_format",
    "duplicate",
    "suspicious_pattern",
    "regression",
    "combined",
    "idempotency",
  ]),
  description: z.string(),
  requirementIds: z.array(z.string()).default([]),
  businessRuleIds: z.array(z.string()).min(1),
  preconditions: z.array(z.string()).default([]),
  inputOverrides: z.record(z.unknown()).default({}),
  expectedOutcome: z.enum(["accept", "reject", "flag_review", "follow_contract"]),
  expectedStatusCodes: z.array(z.number()).optional(),
  expectedResponseFields: z.array(z.string()).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  rationale: z.string().optional(),
  requiresHumanReview: z.boolean().default(false),
  status: z.enum(["draft", "approved", "rejected"]).default("draft"),
});

export const TestFixtureSchema = z.object({
  id: z.string(),
  scenarioId: z.string(),
  synthetic: z.literal(true),
  entities: z.record(z.unknown()),
  requestPayload: z.record(z.unknown()),
  cleanupInstructions: z.array(z.string()).optional(),
});

export const AssertionResultSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  error: z.string().optional(),
});

export const ExecutionResultSchema = z.object({
  runId: z.string(),
  scenarioId: z.string().optional(),
  requestName: z.string(),
  status: z.enum([
    "passed",
    "assertion_failed",
    "request_failed",
    "timed_out",
    "skipped",
    "inconclusive",
  ]),
  httpStatus: z.number().optional(),
  responseTimeMs: z.number().optional(),
  assertionResults: z.array(AssertionResultSchema).default([]),
  sanitizedEvidence: z.record(z.unknown()).default({}),
  errorMessage: z.string().optional(),
});

export const ExecutionSummarySchema = z.object({
  runId: z.string(),
  projectId: z.string(),
  collectionId: z.string(),
  runnerName: z.string(),
  runnerVersion: z.string().optional(),
  targetBaseUrl: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  processExitCode: z.number().optional(),
  overallStatus: z.enum(["passed", "failed", "error", "timed_out", "cancelled"]),
  totalTests: z.number().default(0),
  passed: z.number().default(0),
  failed: z.number().default(0),
  results: z.array(ExecutionResultSchema).default([]),
  artifactPath: z.string().optional(),
  errorMessage: z.string().optional(),
});

export const FindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.enum(["low", "medium", "high"]),
  classification: z.enum([
    "potential_business_rule_defect",
    "api_contract_mismatch",
    "test_infrastructure_failure",
    "inconclusive",
  ]),
  scenarioIds: z.array(z.string()),
  businessRuleIds: z.array(z.string()),
  expectedBehavior: z.string(),
  actualBehavior: z.string(),
  evidence: z.array(z.string()),
  reproductionSteps: z.array(z.string()),
  recommendation: z.string(),
  status: z.enum(["open", "under_review", "confirmed", "dismissed"]).default("open"),
});

export const PostmanCollectionMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  requestCount: z.number(),
  scenarioIds: z.array(z.string()),
  createdAt: z.string(),
  collectionPath: z.string(),
  environmentPath: z.string().optional(),
  unresolvedAssumptions: z.array(z.string()).default([]),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  productType: z.string().default("life"),
  requirementText: z.string(),
  apiSpecText: z.string().optional(),
  executionMode: z.enum(["mock", "approved_test"]).default("mock"),
  workflowState: WorkflowStateSchema.default("draft"),
  requirement: RequirementDocumentSchema.optional(),
  scenarios: z.array(TestScenarioSchema).default([]),
  fixtures: z.array(TestFixtureSchema).default([]),
  collection: PostmanCollectionMetaSchema.optional(),
  runs: z.array(z.string()).default([]),
  findings: z.array(FindingSchema).default([]),
  lastError: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateProjectInputSchema = z.object({
  name: z.string().min(1),
  productType: z.string().default("life"),
  requirementText: z.string().min(10),
  apiSpecText: z.string().optional(),
  executionMode: z.enum(["mock", "approved_test"]).default("mock"),
});

export const ApproveRulesInputSchema = z.object({
  rules: z.array(BusinessRuleSchema),
  assumptions: z.array(z.string()).optional(),
  openQuestions: z.array(OpenQuestionSchema).optional(),
});

export const ApproveScenariosInputSchema = z.object({
  scenarios: z.array(
    z.object({
      id: z.string(),
      status: z.enum(["draft", "approved", "rejected"]),
    })
  ),
});

export const StartRunInputSchema = z.object({
  collectionId: z.string(),
  targetBaseUrl: z.string().url(),
  confirmTarget: z.boolean().default(false),
  runner: z.enum(["newman"]).default("newman"),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type BusinessRule = z.infer<typeof BusinessRuleSchema>;
export type OpenQuestion = z.infer<typeof OpenQuestionSchema>;
export type RequiredField = z.infer<typeof RequiredFieldSchema>;
export type RequirementDocument = z.infer<typeof RequirementDocumentSchema>;
export type TestScenario = z.infer<typeof TestScenarioSchema>;
export type TestFixture = z.infer<typeof TestFixtureSchema>;
export type AssertionResult = z.infer<typeof AssertionResultSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export type ExecutionSummary = z.infer<typeof ExecutionSummarySchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type PostmanCollectionMeta = z.infer<typeof PostmanCollectionMetaSchema>;
export type Project = z.infer<typeof ProjectSchema>;
