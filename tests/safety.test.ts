import { describe, expect, it } from "vitest";
import { assertAllowedTarget } from "../src/runner/safety.js";
import { SafetyError } from "../src/shared/errors.js";
import { config } from "../src/config.js";

describe("execution safety", () => {
  it("allows local mock API", () => {
    expect(() =>
      assertAllowedTarget(`http://127.0.0.1:${config.mockApiPort}`, false)
    ).not.toThrow();
  });

  it("blocks unknown hosts", () => {
    expect(() => assertAllowedTarget("https://evil.example.com", true)).toThrow(SafetyError);
  });

  it("requires confirmation for non-mock local ports", () => {
    expect(() => assertAllowedTarget("http://127.0.0.1:9999", false)).toThrow(SafetyError);
    expect(() => assertAllowedTarget("http://127.0.0.1:9999", true)).not.toThrow();
  });
});
