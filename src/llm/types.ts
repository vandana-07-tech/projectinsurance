import type { z } from "zod";

export interface LlmRequest<TSchema extends z.ZodTypeAny> {
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  schema: TSchema;
  temperature?: number;
}

export interface LlmResponse<T> {
  data: T;
  provider: string;
  model: string;
  rawText?: string;
}

export interface LlmProvider {
  readonly name: string;
  complete<TSchema extends z.ZodTypeAny>(
    request: LlmRequest<TSchema>
  ): Promise<LlmResponse<z.infer<TSchema>>>;
}
