export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class WorkflowError extends AppError {
  constructor(message: string) {
    super(message, "WORKFLOW_ERROR", 409);
    this.name = "WorkflowError";
  }
}

export class SafetyError extends AppError {
  constructor(message: string) {
    super(message, "SAFETY_ERROR", 403);
    this.name = "SafetyError";
  }
}
