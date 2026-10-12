const CORE_RULES = [
  {
    id: "BR-001",
    description: "The life policy must be active.",
    category: "policy_status",
    condition: "policy.status == ACTIVE",
    expectedBehavior: "Reject claim when policy is not ACTIVE",
    source: "explicit_requirement" as const,
    severity: "high" as const,
    status: "draft" as const,
  },
  {
    id: "BR-002",
    description: "The date of death must be on or after the policy start date.",
    category: "coverage_period",
    condition: "dateOfDeath >= policy.startDate",
    expectedBehavior: "Reject claim when dateOfDeath is before policy start",
    source: "explicit_requirement" as const,
    severity: "high" as const,
    status: "draft" as const,
  },
  {
    id: "BR-003",
    description: "The date of death must be on or before the policy end date.",
    category: "coverage_period",
    condition: "dateOfDeath <= policy.endDate",
    expectedBehavior: "Reject claim when dateOfDeath is after policy end",
    source: "explicit_requirement" as const,
    severity: "high" as const,
    status: "draft" as const,
  },
  {
    id: "BR-004",
    description: "The claim amount must be greater than zero.",
    category: "amount",
    condition: "claimAmount > 0",
    expectedBehavior: "Reject claim when claimAmount is zero or negative",
    source: "explicit_requirement" as const,
    severity: "medium" as const,
    status: "draft" as const,
  },
  {
    id: "BR-005",
    description: "The claim amount must not exceed the policy sum assured / coverage limit.",
    category: "amount",
    condition: "claimAmount <= policy.coverageLimit",
    expectedBehavior: "Reject claim when claimAmount exceeds coverageLimit",
    source: "explicit_requirement" as const,
    severity: "critical" as const,
    status: "draft" as const,
  },
  {
    id: "BR-006",
    description:
      "A duplicate claim for the same death event must be rejected, subject to the approved duplicate-identification rule.",
    category: "duplicate",
    condition: "duplicateKey(policyNumber, insuredPersonId, dateOfDeath) is unique",
    expectedBehavior: "Reject duplicate claims matching the configured duplicate key",
    source: "explicit_requirement" as const,
    severity: "high" as const,
    status: "draft" as const,
  },
  {
    id: "BR-007",
    description: "Required life claim fields must be provided.",
    category: "required_fields",
    condition: "all required fields present and valid",
    expectedBehavior: "Reject claim when required fields are missing or malformed",
    source: "explicit_requirement" as const,
    severity: "medium" as const,
    status: "draft" as const,
  },
];

const EXTRA_RULES: Record<string, (typeof CORE_RULES)[number]> = {
  "BR-008": {
    id: "BR-008",
    description:
      "Death within the contestability window (demo: 60 days of policy start) must not be auto-accepted.",
    category: "contestability",
    condition: "dateOfDeath within 60 days of policy.startDate => contestability hold",
    expectedBehavior: "Reject auto-acceptance; return contestability hold error",
    source: "explicit_requirement",
    severity: "high",
    status: "draft",
  },
  "BR-009": {
    id: "BR-009",
    description: "Beneficiary on the claim must match a designated policy beneficiary.",
    category: "beneficiary",
    condition: "claim.beneficiaryId in policy.beneficiaryIds",
    expectedBehavior: "Reject claim when beneficiaryId does not match policy beneficiaries",
    source: "explicit_requirement",
    severity: "high",
    status: "draft",
  },
  "BR-010": {
    id: "BR-010",
    description: "Suicide within the first policy year must be rejected.",
    category: "exclusion",
    condition: "causeOfDeath == SUICIDE AND dateOfDeath < startDate + 1 year",
    expectedBehavior: "Reject claim under suicide exclusion",
    source: "explicit_requirement",
    severity: "critical",
    status: "draft",
  },
  "BR-011": {
    id: "BR-011",
    description: "Claims on LAPSED policies or GRACE_PERIOD premiums must not be auto-accepted.",
    category: "premium",
    condition: "policy.premiumStatus not in (LAPSED, GRACE_PERIOD) for auto-accept",
    expectedBehavior: "Reject when premiumStatus is LAPSED or GRACE_PERIOD",
    source: "explicit_requirement",
    severity: "high",
    status: "draft",
  },
  "BR-012": {
    id: "BR-012",
    description: "When benefits are assigned, claim assigneeId must match policy assignee.",
    category: "assignment",
    condition: "if policy.assigneeId set then claim.assigneeId == policy.assigneeId",
    expectedBehavior: "Reject claim when assignee does not match assignment record",
    source: "explicit_requirement",
    severity: "medium",
    status: "draft",
  },
};

const SUGGESTION_POOL = [
  {
    id: "BR-S01",
    description: "Suggested: Require death certificate reference number on all death claims.",
    category: "suggested",
    condition: "deathCertificateRef is present",
    expectedBehavior: "Reject when deathCertificateRef missing",
    source: "approved_assumption" as const,
    severity: "medium" as const,
    status: "draft" as const,
  },
  {
    id: "BR-S02",
    description: "Suggested: Claim submission date must not be more than 90 days after date of death.",
    category: "suggested",
    condition: "submissionDate <= dateOfDeath + 90 days",
    expectedBehavior: "Reject late submissions beyond 90 days",
    source: "approved_assumption" as const,
    severity: "medium" as const,
    status: "draft" as const,
  },
  {
    id: "BR-S03",
    description: "Suggested: Foreign death claims require additional document checklist.",
    category: "suggested",
    condition: "if deathCountry != homeCountry then docs checklist complete",
    expectedBehavior: "Flag or reject incomplete foreign-death documentation",
    source: "approved_assumption" as const,
    severity: "low" as const,
    status: "draft" as const,
  },
];

function detectFocus(text: string): string[] {
  const t = text.toLowerCase();
  const ids: string[] = ["BR-001", "BR-007"];
  if (t.includes("active") || t.includes("policy is active")) ids.push("BR-001");
  if (t.includes("policy period") || t.includes("date of death")) {
    ids.push("BR-002", "BR-003");
  }
  if (t.includes("sum assured") || t.includes("coverage") || t.includes("claim amount")) {
    ids.push("BR-004", "BR-005");
  }
  if (t.includes("duplicate")) ids.push("BR-006");
  if (t.includes("contestab") || t.includes("two years") || t.includes("2 years") || t.includes("investigation")) {
    ids.push("BR-008");
  }
  if (t.includes("beneficiary")) ids.push("BR-009", "BR-005");
  if (t.includes("suicide")) ids.push("BR-010", "BR-002", "BR-003");
  if (t.includes("grace") || t.includes("lapsed") || t.includes("premium")) ids.push("BR-011", "BR-005");
  if (t.includes("assign")) ids.push("BR-012", "BR-006", "BR-005");
  return [...new Set(ids)];
}

export function mockRequirementOutput(userPrompt: string): unknown {
  const now = new Date().toISOString();
  const titleMatch = /Title:\s*(.+)/i.exec(userPrompt);
  const reqMatch = /Requirement:\s*([\s\S]+?)(?:API Spec:|$)/i.exec(userPrompt);
  const requirementText = (reqMatch?.[1] || userPrompt).trim();
  const title = titleMatch?.[1]?.trim() || "Life Insurance Death Claim Submission";
  const focusIds = detectFocus(requirementText);

  const rules = focusIds
    .map((id) => CORE_RULES.find((r) => r.id === id) || EXTRA_RULES[id])
    .filter(Boolean)
    .map((r) => ({ ...r! }));

  // Always ensure core minimum for demo executability
  for (const must of ["BR-001", "BR-007"]) {
    if (!rules.some((r) => r.id === must)) {
      const core = CORE_RULES.find((r) => r.id === must)!;
      rules.unshift({ ...core });
    }
  }

  const suggestedRules = SUGGESTION_POOL.filter((s) => !rules.some((r) => r.id === s.id));

  const fields = [
    { name: "claimId", dataType: "string", required: true },
    { name: "policyNumber", dataType: "string", required: true },
    { name: "customerId", dataType: "string", required: true },
    { name: "insuredPersonId", dataType: "string", required: true },
    { name: "dateOfDeath", dataType: "date", required: true },
    { name: "claimAmount", dataType: "number", required: true },
    { name: "beneficiaryId", dataType: "string", required: focusIds.includes("BR-009") },
    { name: "causeOfDeath", dataType: "string", required: focusIds.includes("BR-010") },
    { name: "assigneeId", dataType: "string", required: focusIds.includes("BR-012") },
    { name: "description", dataType: "string", required: false },
  ];

  return {
    title,
    productType: "life",
    rules,
    suggestedRules,
    requiredFields: fields,
    openQuestions: [
      {
        id: "OQ-001",
        question: "Is the policy end date inclusive for date-of-death validation?",
        relatedRuleIds: ["BR-003"],
      },
      {
        id: "OQ-002",
        question: "Confirm which suggested rules should be promoted to approved requirements.",
        relatedRuleIds: suggestedRules.map((s) => s.id),
      },
    ],
    assumptions: [
      "Policy end date is treated as inclusive for demo mock API unless clarified.",
      "Sum assured / coverage limit is inclusive when BR-005 applies.",
      "Duplicate key for MVP: policyNumber + insuredPersonId + dateOfDeath.",
      "Suggested rules are optional until the user adds them.",
    ],
    expectedSuccessBehavior: "Return HTTP 201 with status ACCEPTED for valid life claims.",
    expectedRejectionBehavior:
      "Return HTTP 400 for validation failures and HTTP 409 for duplicates, with an error code and message.",
    confidence: "medium",
    extractedAt: now,
  };
}
