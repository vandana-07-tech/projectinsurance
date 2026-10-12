import { afterEach, describe, expect, it } from "vitest";
import { createMockInsuranceApp } from "../src/mock-api/app.js";
import {
  resetClaims,
  setIntentionalDefect,
} from "../src/mock-api/store.js";

async function withApp(fn: (base: string) => Promise<void>) {
  const app = createMockInsuranceApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(base);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("mock insurance API", () => {
  afterEach(() => {
    resetClaims();
    setIntentionalDefect(false);
  });

  it("accepts a valid claim", async () => {
    await withApp(async (base) => {
      const res = await fetch(`${base}/api/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: "CLM-T-1",
          policyNumber: "POL10001",
          customerId: "CUS1001",
          insuredPersonId: "INS1001",
          dateOfDeath: "2026-06-15",
          claimAmount: 50000,
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("ACCEPTED");
    });
  });

  it("rejects over-limit claims by default", async () => {
    await withApp(async (base) => {
      const res = await fetch(`${base}/api/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: "CLM-T-2",
          policyNumber: "POL10001",
          customerId: "CUS1001",
          insuredPersonId: "INS1001",
          dateOfDeath: "2026-06-15",
          claimAmount: 100001,
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  it("accepts over-limit when intentional defect enabled", async () => {
    setIntentionalDefect(true);
    await withApp(async (base) => {
      const res = await fetch(`${base}/api/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: "CLM-T-3",
          policyNumber: "POL10001",
          customerId: "CUS1001",
          insuredPersonId: "INS1001",
          dateOfDeath: "2026-06-15",
          claimAmount: 100001,
        }),
      });
      expect(res.status).toBe(201);
    });
  });

  it("rejects duplicates by configured key", async () => {
    await withApp(async (base) => {
      const payload = {
        claimId: "CLM-T-4",
        policyNumber: "POL10001",
        customerId: "CUS1001",
        insuredPersonId: "INS1001",
        dateOfDeath: "2026-06-15",
        claimAmount: 40000,
      };
      const first = await fetch(`${base}/api/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(first.status).toBe(201);
      const second = await fetch(`${base}/api/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, claimId: "CLM-T-5", claimAmount: 41000 }),
      });
      expect(second.status).toBe(409);
    });
  });
});
