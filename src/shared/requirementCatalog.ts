export interface CatalogRequirement {
  id: string;
  title: string;
  focus: string;
  priority: "high" | "medium" | "critical";
  tags: string[];
  text: string;
  expectedRuleHints: string[];
}

/** Hackathon demo sheet — up to 6 life-insurance requirements */
export const REQUIREMENT_SHEET: CatalogRequirement[] = [
  {
    id: "REQ-01",
    title: "Core death claim validation",
    focus: "Active policy, coverage period, sum assured, duplicates",
    priority: "critical",
    tags: ["core", "sum-assured", "duplicate"],
    expectedRuleHints: ["BR-001", "BR-002", "BR-003", "BR-004", "BR-005", "BR-006", "BR-007"],
    text: "As a beneficiary, I should be able to submit a life insurance death claim against an active life policy. The system should accept the claim only when the policy is active, the date of death falls within the policy period, the claim amount does not exceed the policy sum assured, and duplicate claims for the same death event are rejected.",
  },
  {
    id: "REQ-02",
    title: "Contestability / investigation window",
    focus: "Death within first 2 years requires investigation flag",
    priority: "high",
    tags: ["contestability", "investigation"],
    expectedRuleHints: ["BR-001", "BR-002", "BR-003", "BR-008", "BR-007"],
    text: "As a claims examiner, when a life insurance death claim is submitted and the date of death is within two years of the policy start date, the system must flag the claim for contestability investigation while still validating that the policy is active and the death date is within the policy period. Claims outside the two-year window follow the standard acceptance path when other validations pass.",
  },
  {
    id: "REQ-03",
    title: "Beneficiary identity match",
    focus: "Claimant must match designated beneficiary",
    priority: "high",
    tags: ["beneficiary", "identity"],
    expectedRuleHints: ["BR-001", "BR-007", "BR-009", "BR-005"],
    text: "As a beneficiary submitting a life death claim, the system must accept the claim only when the policy is active, required claim fields are present, the claim amount does not exceed the sum assured, and the beneficiaryId on the claim matches a designated beneficiary recorded on the policy. Mismatched beneficiary identity must be rejected.",
  },
  {
    id: "REQ-04",
    title: "Suicide exclusion (first year)",
    focus: "Suicide cause within first policy year is rejected",
    priority: "critical",
    tags: ["exclusion", "suicide"],
    expectedRuleHints: ["BR-001", "BR-002", "BR-003", "BR-010", "BR-007"],
    text: "As an insurer, a life insurance death claim must be rejected when the cause of death is suicide and the date of death is within one year of the policy start date. The policy must still be active and the death date within the policy period for other claims. Required fields including causeOfDeath must be provided.",
  },
  {
    id: "REQ-05",
    title: "Premium grace period status",
    focus: "Lapsed / grace-period policies cannot pay full claim",
    priority: "high",
    tags: ["premium", "grace-period", "lapse"],
    expectedRuleHints: ["BR-001", "BR-011", "BR-005", "BR-007"],
    text: "As a claims system, a life death claim should be accepted only when the policy status is ACTIVE and premium status is not LAPSED. If the policy is in GRACE_PERIOD, the claim must be flagged for premium review rather than auto-accepted. Claim amount must not exceed the sum assured and required fields must be present.",
  },
  {
    id: "REQ-06",
    title: "Assignment and multiple claimants",
    focus: "Assigned benefits and blocking parallel open claims",
    priority: "medium",
    tags: ["assignment", "multi-claimant"],
    expectedRuleHints: ["BR-001", "BR-006", "BR-012", "BR-005", "BR-007"],
    text: "As an operations user, when a life policy benefit has been assigned, death claims must be submitted by the assignee reference. The system must reject a new claim if another open claim already exists for the same policy and death event (duplicate key). The policy must be active, claim amount within sum assured, and required fields provided.",
  },
];

export function getCatalogRequirement(id: string): CatalogRequirement | undefined {
  return REQUIREMENT_SHEET.find((r) => r.id === id);
}
