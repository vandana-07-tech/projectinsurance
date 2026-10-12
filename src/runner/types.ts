import type { ExecutionSummary } from "../shared/schemas.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  collectionFormat?: string;
}

export interface ExecutionRequest {
  runId: string;
  projectId: string;
  collectionId: string;
  collectionPath: string;
  environmentPath?: string;
  targetBaseUrl: string;
  timeoutMs: number;
}

export interface RunnerCapabilities {
  name: string;
  supportsCollectionFormats: string[];
  supportsEnvironmentFile: boolean;
  supportsTimeout: boolean;
}

export interface ExecutionRunner {
  validateCollection(collectionPath: string): Promise<ValidationResult>;
  execute(request: ExecutionRequest): Promise<ExecutionSummary>;
  getCapabilities(): RunnerCapabilities;
}
