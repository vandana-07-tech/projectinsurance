import { config } from "../config.js";

export interface PolicyRecord {
  policyNumber: string;
  customerId: string;
  insuredPersonId: string;
  status: "ACTIVE" | "INACTIVE";
  startDate: string;
  endDate: string;
  coverageLimit: number;
  productType: "life";
  premiumStatus: "CURRENT" | "GRACE_PERIOD" | "LAPSED";
  beneficiaryIds: string[];
  assigneeId?: string;
}

export interface ClaimRecord {
  claimId: string;
  policyNumber: string;
  customerId: string;
  insuredPersonId: string;
  dateOfDeath: string;
  claimAmount: number;
  beneficiaryId?: string;
  causeOfDeath?: string;
  assigneeId?: string;
  description?: string;
  status: "ACCEPTED" | "REJECTED";
  createdAt: string;
  duplicateKey: string;
}

const baseFields = {
  productType: "life" as const,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  coverageLimit: 100000,
  premiumStatus: "CURRENT" as const,
  beneficiaryIds: ["BEN1001"],
};

const policies: Record<string, PolicyRecord> = {
  POL10001: {
    ...baseFields,
    policyNumber: "POL10001",
    customerId: "CUS1001",
    insuredPersonId: "INS1001",
    status: "ACTIVE",
  },
  POL10002: {
    ...baseFields,
    policyNumber: "POL10002",
    customerId: "CUS1002",
    insuredPersonId: "INS1002",
    status: "INACTIVE",
  },
  POL10003: {
    ...baseFields,
    policyNumber: "POL10003",
    customerId: "CUS1003",
    insuredPersonId: "INS1003",
    status: "ACTIVE",
    premiumStatus: "GRACE_PERIOD",
  },
  POL10004: {
    ...baseFields,
    policyNumber: "POL10004",
    customerId: "CUS1004",
    insuredPersonId: "INS1004",
    status: "ACTIVE",
    assigneeId: "ASN1001",
  },
};

const claims = new Map<string, ClaimRecord>();
const claimsByDuplicateKey = new Map<string, string>();

let intentionalDefect = config.mockIntentionalDefect;

export function getPolicy(policyNumber: string): PolicyRecord | undefined {
  return policies[policyNumber];
}

export function listPolicies(): PolicyRecord[] {
  return Object.values(policies);
}

export function getClaim(claimId: string): ClaimRecord | undefined {
  return claims.get(claimId);
}

export function buildDuplicateKey(input: {
  policyNumber: string;
  insuredPersonId: string;
  dateOfDeath: string;
}): string {
  return [input.policyNumber, input.insuredPersonId, input.dateOfDeath].join("|");
}

export function findDuplicate(duplicateKey: string): ClaimRecord | undefined {
  const id = claimsByDuplicateKey.get(duplicateKey);
  return id ? claims.get(id) : undefined;
}

export function saveClaim(claim: ClaimRecord): void {
  claims.set(claim.claimId, claim);
  if (claim.status === "ACCEPTED") {
    claimsByDuplicateKey.set(claim.duplicateKey, claim.claimId);
  }
}

export function resetClaims(): void {
  claims.clear();
  claimsByDuplicateKey.clear();
}

export function setIntentionalDefect(enabled: boolean): void {
  intentionalDefect = enabled;
}

export function isIntentionalDefectEnabled(): boolean {
  return intentionalDefect;
}

/** Demo contestability window: 60 days from policy start */
export function isWithinContestabilityWindow(startDate: string, dateOfDeath: string): boolean {
  const start = Date.parse(startDate);
  const death = Date.parse(dateOfDeath);
  if (Number.isNaN(start) || Number.isNaN(death)) return false;
  const days = (death - start) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 60;
}

export function isWithinFirstPolicyYear(startDate: string, dateOfDeath: string): boolean {
  const start = Date.parse(startDate);
  const death = Date.parse(dateOfDeath);
  if (Number.isNaN(start) || Number.isNaN(death)) return false;
  const days = (death - start) / (1000 * 60 * 60 * 24);
  return days >= 0 && days < 365;
}
