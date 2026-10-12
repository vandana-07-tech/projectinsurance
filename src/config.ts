import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function env(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const config = {
  rootDir,
  port: Number(env("PORT", "3000")),
  mockApiPort: Number(env("MOCK_API_PORT", "3001")),
  dataDir: path.resolve(rootDir, env("DATA_DIR", "./data")),
  artifactsDir: path.resolve(rootDir, "artifacts"),
  publicDir: path.resolve(rootDir, "public"),
  llmProvider: env("LLM_PROVIDER", "mock") as "mock" | "openai",
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
  allowedHosts: env("ALLOWED_HOSTS", "localhost,127.0.0.1")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
  mockIntentionalDefect: envBool("MOCK_INTENTIONAL_DEFECT", false),
  executionTimeoutMs: Number(env("EXECUTION_TIMEOUT_MS", "120000")),
  mockApiBaseUrl: `http://127.0.0.1:${env("MOCK_API_PORT", "3001")}`,
  /** Duplicate key fields for life insurance MVP */
  duplicateKeyFields: ["policyNumber", "insuredPersonId", "dateOfDeath"] as const,
};

export type AppConfig = typeof config;
