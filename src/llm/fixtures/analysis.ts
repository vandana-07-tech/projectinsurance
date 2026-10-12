export function mockAnalysisNarrative(userPrompt: string): unknown {
  const failedCount = Number(/FAILED_COUNT:(\d+)/.exec(userPrompt)?.[1] || "0");
  const defectHint = userPrompt.includes("DEFECT_HINT:over_limit_accepted");

  return {
    summary:
      failedCount === 0
        ? "All executed assertions matched expected business outcomes for this run."
        : defectHint
          ? "At least one over-limit claim was accepted. This is a potential business-rule validation defect for coverage-limit enforcement."
          : "One or more assertions did not match expected outcomes. Review evidence before confirming defects.",
    recommendations: defectHint
      ? [
          "Confirm coverage-limit rule BR-005 with the product owner.",
          "Add a regression scenario for claimAmount = coverageLimit + 1.",
          "Verify intentional-defect mode is disabled outside local demos.",
        ]
      : [
          "Review failed assertions with request/response evidence.",
          "Confirm ambiguous rules marked for human review before raising defects.",
        ],
  };
}
