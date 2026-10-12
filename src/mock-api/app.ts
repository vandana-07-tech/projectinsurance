import express from "express";
import {
  buildDuplicateKey,
  findDuplicate,
  getClaim,
  getPolicy,
  isIntentionalDefectEnabled,
  isWithinContestabilityWindow,
  isWithinFirstPolicyYear,
  listPolicies,
  resetClaims,
  saveClaim,
  setIntentionalDefect,
} from "./store.js";

export function createMockInsuranceApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "mock-life-insurance-api",
      productType: "life",
      intentionalDefect: isIntentionalDefectEnabled(),
      duplicateKeyFields: ["policyNumber", "insuredPersonId", "dateOfDeath"],
    });
  });

  app.get("/api/policies", (_req, res) => {
    res.json({ policies: listPolicies() });
  });

  app.get("/api/policies/:policyNumber", (req, res) => {
    const policy = getPolicy(req.params.policyNumber);
    if (!policy) {
      return res.status(404).json({
        error: { code: "POLICY_NOT_FOUND", message: "Policy not found" },
      });
    }
    return res.json(policy);
  });

  app.get("/api/claims/:claimId", (req, res) => {
    const claim = getClaim(req.params.claimId);
    if (!claim) {
      return res.status(404).json({
        error: { code: "CLAIM_NOT_FOUND", message: "Claim not found" },
      });
    }
    return res.json(claim);
  });

  app.post("/api/claims", (req, res) => {
    const body = req.body ?? {};
    const required = [
      "claimId",
      "policyNumber",
      "customerId",
      "insuredPersonId",
      "dateOfDeath",
      "claimAmount",
    ];
    for (const field of required) {
      if (body[field] === undefined || body[field] === null || body[field] === "") {
        return res.status(400).json({
          error: {
            code: "MISSING_FIELD",
            message: `Required field missing: ${field}`,
            field,
          },
        });
      }
    }

    const dateOfDeath = String(body.dateOfDeath);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfDeath) || Number.isNaN(Date.parse(dateOfDeath))) {
      return res.status(400).json({
        error: {
          code: "INVALID_DATE",
          message: "dateOfDeath must be YYYY-MM-DD",
          field: "dateOfDeath",
        },
      });
    }

    const claimAmount = Number(body.claimAmount);
    if (!Number.isFinite(claimAmount)) {
      return res.status(400).json({
        error: { code: "INVALID_AMOUNT", message: "claimAmount must be a number" },
      });
    }

    const policy = getPolicy(String(body.policyNumber));
    if (!policy) {
      return res.status(400).json({
        error: { code: "POLICY_NOT_FOUND", message: "Unknown policyNumber" },
      });
    }

    if (policy.status !== "ACTIVE") {
      return res.status(400).json({
        error: { code: "POLICY_INACTIVE", message: "Policy must be active" },
      });
    }

    if (dateOfDeath < policy.startDate) {
      return res.status(400).json({
        error: {
          code: "DEATH_BEFORE_START",
          message: "Date of death is before policy start date",
        },
      });
    }

    if (dateOfDeath > policy.endDate) {
      return res.status(400).json({
        error: {
          code: "DEATH_AFTER_END",
          message: "Date of death is after policy end date",
        },
      });
    }

    if (claimAmount <= 0) {
      return res.status(400).json({
        error: { code: "AMOUNT_NOT_POSITIVE", message: "Claim amount must be greater than zero" },
      });
    }

    // Intentional defect: skip sum-assured / coverage-limit check when enabled (local demo only)
    if (claimAmount > policy.coverageLimit && !isIntentionalDefectEnabled()) {
      return res.status(400).json({
        error: {
          code: "AMOUNT_EXCEEDS_LIMIT",
          message: "Claim amount exceeds policy sum assured / coverage limit",
          coverageLimit: policy.coverageLimit,
        },
      });
    }

    if (policy.premiumStatus === "LAPSED" || policy.premiumStatus === "GRACE_PERIOD") {
      return res.status(400).json({
        error: {
          code: "PREMIUM_STATUS_BLOCK",
          message: `Policy premium status ${policy.premiumStatus} cannot auto-accept claims`,
          premiumStatus: policy.premiumStatus,
        },
      });
    }

    if (isWithinContestabilityWindow(policy.startDate, dateOfDeath)) {
      return res.status(400).json({
        error: {
          code: "CONTESTABILITY_HOLD",
          message: "Death within contestability window (demo: 60 days) requires investigation",
        },
      });
    }

    if (body.beneficiaryId !== undefined && body.beneficiaryId !== null && body.beneficiaryId !== "") {
      const beneficiaryId = String(body.beneficiaryId);
      if (!policy.beneficiaryIds.includes(beneficiaryId)) {
        return res.status(400).json({
          error: {
            code: "BENEFICIARY_MISMATCH",
            message: "beneficiaryId does not match designated policy beneficiaries",
          },
        });
      }
    }

    const causeOfDeath = body.causeOfDeath ? String(body.causeOfDeath).toUpperCase() : undefined;
    if (
      causeOfDeath === "SUICIDE" &&
      isWithinFirstPolicyYear(policy.startDate, dateOfDeath)
    ) {
      return res.status(400).json({
        error: {
          code: "SUICIDE_EXCLUSION",
          message: "Suicide within the first policy year is excluded",
        },
      });
    }

    if (policy.assigneeId) {
      const assigneeId = body.assigneeId ? String(body.assigneeId) : "";
      if (assigneeId !== policy.assigneeId) {
        return res.status(400).json({
          error: {
            code: "ASSIGNEE_MISMATCH",
            message: "Claim assigneeId must match policy assignment",
          },
        });
      }
    }

    const duplicateKey = buildDuplicateKey({
      policyNumber: String(body.policyNumber),
      insuredPersonId: String(body.insuredPersonId),
      dateOfDeath,
    });

    const existing = findDuplicate(duplicateKey);
    if (existing) {
      return res.status(409).json({
        error: {
          code: "DUPLICATE_CLAIM",
          message: "Duplicate life claim for the same death event key",
          duplicateKey,
          originalClaimId: existing.claimId,
        },
      });
    }

    const claim = {
      claimId: String(body.claimId),
      policyNumber: String(body.policyNumber),
      customerId: String(body.customerId),
      insuredPersonId: String(body.insuredPersonId),
      dateOfDeath,
      claimAmount,
      beneficiaryId: body.beneficiaryId ? String(body.beneficiaryId) : undefined,
      causeOfDeath,
      assigneeId: body.assigneeId ? String(body.assigneeId) : undefined,
      description: body.description ? String(body.description) : undefined,
      status: "ACCEPTED" as const,
      createdAt: new Date().toISOString(),
      duplicateKey,
    };

    if (getClaim(claim.claimId)) {
      return res.status(409).json({
        error: { code: "CLAIM_ID_EXISTS", message: "claimId already exists" },
      });
    }

    saveClaim(claim);
    return res.status(201).json({
      status: "ACCEPTED",
      claim,
    });
  });

  app.post("/admin/reset", (_req, res) => {
    resetClaims();
    res.json({ status: "reset" });
  });

  app.post("/admin/intentional-defect", (req, res) => {
    const enabled = Boolean(req.body?.enabled);
    setIntentionalDefect(enabled);
    res.json({ intentionalDefect: isIntentionalDefectEnabled() });
  });

  app.get("/admin/intentional-defect", (_req, res) => {
    res.json({ intentionalDefect: isIntentionalDefectEnabled() });
  });

  return app;
}
