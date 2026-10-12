import { config } from "../config.js";
import { MockLlmProvider } from "./mockProvider.js";
import type { LlmProvider } from "./types.js";

let cached: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (cached) return cached;

  if (config.llmProvider === "openai" && config.openaiApiKey) {
    // Optional live provider can be added later; MVP defaults to mock for demos.
    console.warn(
      "[llm] OPENAI selected but live adapter not required for MVP — using mock provider."
    );
  }

  cached = new MockLlmProvider();
  return cached;
}

export function resetLlmProvider(): void {
  cached = null;
}
