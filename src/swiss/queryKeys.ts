export const swissKeys = {
  all: ["swiss"] as const,
  qualification: (stageId: number, stageGroupId: number) =>
    [...swissKeys.all, "qualification", stageId, stageGroupId] as const,
  playoffProposal: (stageId: number, stageGroupId: number) =>
    [...swissKeys.all, "playoff-proposal", stageId, stageGroupId] as const,
  knockoutPreview: (stageId: number) =>
    [...swissKeys.all, "knockout-preview", stageId] as const,
};
