import fs from "node:fs/promises";
import path from "node:path";
import newman from "newman";
import { config } from "../config.js";
import { redactObject, redactText } from "../shared/redact.js";
import type { ExecutionResult, ExecutionSummary } from "../shared/schemas.js";
import type {
  ExecutionRequest,
  ExecutionRunner,
  RunnerCapabilities,
  ValidationResult,
} from "./types.js";

export class NewmanRunner implements ExecutionRunner {
  getCapabilities(): RunnerCapabilities {
    return {
      name: "newman",
      supportsCollectionFormats: ["postman_collection_v2.1"],
      supportsEnvironmentFile: true,
      supportsTimeout: true,
    };
  }

  async validateCollection(collectionPath: string): Promise<ValidationResult> {
    try {
      const raw = await fs.readFile(collectionPath, "utf8");
      const collection = JSON.parse(raw) as {
        info?: { schema?: string; name?: string };
        item?: unknown[];
      };
      const errors: string[] = [];
      if (!collection.info?.name) errors.push("Missing info.name");
      if (!collection.info?.schema?.includes("v2.1.0")) {
        errors.push("Unsupported or missing Postman Collection v2.1 schema");
      }
      if (!Array.isArray(collection.item) || collection.item.length === 0) {
        errors.push("Collection has no items");
      }
      return {
        valid: errors.length === 0,
        errors,
        collectionFormat: "postman_collection_v2.1",
      };
    } catch (err) {
      return {
        valid: false,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  async execute(request: ExecutionRequest): Promise<ExecutionSummary> {
    const startedAt = new Date().toISOString();
    const validation = await this.validateCollection(request.collectionPath);
    if (!validation.valid) {
      return {
        runId: request.runId,
        projectId: request.projectId,
        collectionId: request.collectionId,
        runnerName: "newman",
        targetBaseUrl: request.targetBaseUrl,
        startedAt,
        endedAt: new Date().toISOString(),
        overallStatus: "error",
        totalTests: 0,
        passed: 0,
        failed: 0,
        results: [],
        errorMessage: `Collection validation failed: ${validation.errors.join("; ")}`,
      };
    }

    const summaryOut = path.join(
      config.artifactsDir,
      request.projectId,
      `${request.runId}-newman-summary.json`
    );
    await fs.mkdir(path.dirname(summaryOut), { recursive: true });

    const results: ExecutionResult[] = [];
    let processExitCode = 0;
    let runnerError: string | undefined;

    await new Promise<void>((resolve) => {
      const run = newman.run(
        {
          collection: request.collectionPath,
          environment: request.environmentPath,
          envVar: [{ key: "baseUrl", value: request.targetBaseUrl }],
          reporters: ["cli", "json"],
          reporter: {
            json: { export: summaryOut },
          },
          timeout: request.timeoutMs,
          timeoutRequest: Math.min(request.timeoutMs, 30000),
          insecure: true,
        },
        (err, summary) => {
          if (err) {
            runnerError = err.message;
            processExitCode = 1;
          }
          if (summary) {
            processExitCode = summary.run.failures?.length ? 1 : processExitCode;
            for (const exec of summary.run.executions || []) {
              const scenarioId = extractScenarioId(exec);
              const assertions = (exec.assertions || []).map((a: {
                assertion: string;
                error?: { message?: string };
              }) => ({
                name: a.assertion,
                passed: !a.error,
                error: a.error?.message,
              }));
              const failedAssertions = assertions.some((a) => !a.passed);
              const httpStatus = exec.response?.code;
              const requestFailed = !exec.response;
              let status: ExecutionResult["status"] = "passed";
              if (requestFailed) status = "request_failed";
              else if (failedAssertions) status = "assertion_failed";

              results.push({
                runId: request.runId,
                scenarioId,
                requestName: exec.item?.name || "unnamed",
                status,
                httpStatus,
                responseTimeMs: exec.response?.responseTime,
                assertionResults: assertions,
                sanitizedEvidence: redactObject({
                  requestBody: safeJson(exec.request?.body?.raw),
                  responseBody: safeJson(
                    exec.response?.stream
                      ? Buffer.from(exec.response.stream).toString("utf8")
                      : undefined
                  ),
                  headers: exec.request?.headers
                    ? Object.fromEntries(
                        exec.request.headers.map((h: { key: string; value: string }) => [
                          h.key,
                          h.value,
                        ])
                      )
                    : {},
                }),
                errorMessage: requestFailed
                  ? redactText(exec.requestError?.message || "No response")
                  : undefined,
              });
            }
          }
          resolve();
        }
      );

      const timer = setTimeout(() => {
        try {
          // newman Run object supports abort in some versions; fall back to mark timeout
          (run as { abort?: () => void }).abort?.();
        } catch {
          /* ignore */
        }
        runnerError = runnerError || "Execution timed out";
        processExitCode = 1;
        resolve();
      }, request.timeoutMs + 5000);

      run.on("done", () => clearTimeout(timer));
    });

    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.length - passed;
    const overallStatus =
      runnerError && !results.length
        ? runnerError.includes("timed out")
          ? "timed_out"
          : "error"
        : failed > 0
          ? "failed"
          : "passed";

    return {
      runId: request.runId,
      projectId: request.projectId,
      collectionId: request.collectionId,
      runnerName: "newman",
      runnerVersion: "6.x",
      targetBaseUrl: request.targetBaseUrl,
      startedAt,
      endedAt: new Date().toISOString(),
      processExitCode,
      overallStatus,
      totalTests: results.length,
      passed,
      failed,
      results,
      artifactPath: summaryOut,
      errorMessage: runnerError ? redactText(runnerError) : undefined,
    };
  }
}

function extractScenarioId(exec: {
  item?: { name?: string };
  request?: { headers?: Array<{ key: string; value: string }> };
}): string | undefined {
  const header = exec.request?.headers?.find(
    (h) => h.key.toLowerCase() === "x-scenario-id"
  );
  if (header?.value) return header.value;
  const name = exec.item?.name || "";
  const match = /^(SC-\d+)/.exec(name);
  return match?.[1];
}

function safeJson(raw?: string): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw.slice(0, 2000);
  }
}

export function createRunner(name: "newman" = "newman"): ExecutionRunner {
  if (name === "newman") return new NewmanRunner();
  throw new Error(`Unsupported runner: ${name}`);
}
