import { nanoid } from "nanoid";
import { z } from "zod";
import type { TestFixture, TestScenario } from "../shared/schemas.js";
import { TestFixtureSchema } from "../shared/schemas.js";
import { ValidationError } from "../shared/errors.js";
import { config } from "../config.js";

const BASE_POLICY = {
  policyNumber: "POL10001",
  customerId: "CUS1001",
  insuredPersonId: "INS1001",
  status: "ACTIVE",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  coverageLimit: 100000,
  productType: "life",
  premiumStatus: "CURRENT",
  beneficiaryIds: ["BEN1001"],
};

const POLICY_BY_NUMBER: Record<string, typeof BASE_POLICY & { assigneeId?: string }> = {
  POL10001: BASE_POLICY,
  POL10002: {
    ...BASE_POLICY,
    policyNumber: "POL10002",
    insuredPersonId: "INS1002",
    status: "INACTIVE",
  },
  POL10003: {
    ...BASE_POLICY,
    policyNumber: "POL10003",
    insuredPersonId: "INS1003",
    customerId: "CUS1003",
    premiumStatus: "GRACE_PERIOD",
  },
  POL10004: {
    ...BASE_POLICY,
    policyNumber: "POL10004",
    insuredPersonId: "INS1004",
    customerId: "CUS1004",
    assigneeId: "ASN1001",
  },
};

const ClaimPayloadSchema = z.object({
  claimId: z.string().min(1),
  policyNumber: z.string().optional(),
  customerId: z.string().min(1),
  insuredPersonId: z.string().min(1),
  dateOfDeath: z.union([z.string(), z.number()]),
  claimAmount: z.number(),
  beneficiaryId: z.string().optional(),
  description: z.string().optional(),
});

export function runTestDataAgent(input: {
  scenarios: TestScenario[];
  seed?: number;
}): TestFixture[] {
  const approved = input.scenarios.filter((s) => s.status === "approved");
  if (!approved.length) {
    throw new ValidationError("No approved scenarios for test data generation");
  }

  const fixtures: TestFixture[] = [];
  let seq = input.seed ?? 1;

  // Shared duplicate-key baseline used by SC-001 and intentional duplicate scenarios
  const duplicateBaseline = {
    policyNumber: BASE_POLICY.policyNumber,
    insuredPersonId: BASE_POLICY.insuredPersonId,
    dateOfDeath: "2026-06-15",
  };

  for (const scenario of approved) {
    const policyNumber = String(scenario.inputOverrides.policyNumber || "POL10001");
    const policy = POLICY_BY_NUMBER[policyNumber] || BASE_POLICY;

    const omitFields = Array.isArray(scenario.inputOverrides.omitFields)
      ? (scenario.inputOverrides.omitFields as string[])
      : [];

    const claimId = `CLM-SYN-${String(seq).padStart(3, "0")}`;
    seq += 1;

    // Unique death dates avoid cross-scenario duplicate collisions,
    // except scenarios that explicitly reuse the duplicate baseline key.
    const isDuplicateScenario =
      scenario.category === "duplicate" ||
      Boolean(scenario.inputOverrides.duplicateOfScenario);

    const defaultDateOfDeath = isDuplicateScenario
      ? duplicateBaseline.dateOfDeath
      : scenario.id === "SC-001"
        ? duplicateBaseline.dateOfDeath
        : `2026-06-${String(10 + (seq % 18)).padStart(2, "0")}`;

    const payload: Record<string, unknown> = {
      claimId,
      policyNumber: policy.policyNumber,
      customerId: policy.customerId,
      insuredPersonId: policy.insuredPersonId,
      dateOfDeath: defaultDateOfDeath,
      claimAmount: 50000,
      beneficiaryId: "BEN1001",
      description: `Synthetic life insurance death claim test for ${scenario.id}`,
    };

    for (const [key, value] of Object.entries(scenario.inputOverrides)) {
      if (key === "omitFields" || key === "duplicateOfScenario") continue;
      payload[key] = value;
    }

    // Duplicate scenarios must share the configured MVP duplicate key with SC-001
    if (isDuplicateScenario) {
      payload.policyNumber = duplicateBaseline.policyNumber;
      payload.insuredPersonId = duplicateBaseline.insuredPersonId;
      payload.dateOfDeath = duplicateBaseline.dateOfDeath;
    }

    for (const field of omitFields) {
      delete payload[field];
    }

    // Validate shape except intentionally omitted/malformed fields
    if (!omitFields.includes("policyNumber") && scenario.category !== "invalid_format") {
      const check = ClaimPayloadSchema.safeParse(payload);
      if (!check.success && scenario.expectedOutcome === "accept") {
        throw new ValidationError(
          `Fixture for ${scenario.id} invalid for accept scenario`,
          check.error.flatten()
        );
      }
    }

    const fixture: TestFixture = {
      id: `FIX-${nanoid(8)}`,
      scenarioId: scenario.id,
      synthetic: true,
      entities: {
        policy,
        duplicateKeyFields: [...config.duplicateKeyFields],
      },
      requestPayload: payload,
      cleanupInstructions: [
        `DELETE claim ${claimId} if persisted (mock API resets on restart or /admin/reset).`,
      ],
    };

    const validated = TestFixtureSchema.safeParse(fixture);
    if (!validated.success) {
      throw new ValidationError(`Fixture schema failed for ${scenario.id}`, validated.error.flatten());
    }
    fixtures.push(validated.data);
  }

  return fixtures;
}
