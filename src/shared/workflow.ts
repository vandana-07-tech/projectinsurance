import type { WorkflowState } from "./schemas.js";

const TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  draft: ["requirements_processing", "cancelled"],
  requirements_processing: ["requirements_review", "failed"],
  requirements_review: ["requirements_approved", "requirements_processing", "cancelled", "failed"],
  requirements_approved: ["scenario_generation", "cancelled"],
  scenario_generation: ["scenario_review", "failed"],
  scenario_review: ["scenarios_approved", "scenario_generation", "cancelled", "failed"],
  scenarios_approved: ["test_data_generation", "cancelled"],
  test_data_generation: ["test_generation", "failed"],
  test_generation: ["collection_review", "failed"],
  collection_review: ["ready_to_execute", "test_generation", "cancelled", "failed"],
  ready_to_execute: ["executing", "cancelled"],
  executing: ["analyzing", "failed", "cancelled"],
  analyzing: ["completed", "failed"],
  completed: ["ready_to_execute", "requirements_processing"],
  failed: [
    "draft",
    "requirements_processing",
    "scenario_generation",
    "test_data_generation",
    "test_generation",
    "ready_to_execute",
    "cancelled",
  ],
  cancelled: ["draft"],
};

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: WorkflowState, to: WorkflowState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid workflow transition: ${from} -> ${to}`);
  }
}

export function workflowLabel(state: WorkflowState): string {
  return state.replaceAll("_", " ");
}
