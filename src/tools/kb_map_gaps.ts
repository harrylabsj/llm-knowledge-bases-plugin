import type { GapReport, KnowledgeBasePluginConfig } from "../types.js";
import { validateRuntimeConfig } from "../core/validate.js";
import { collectGapCandidates } from "./gap_candidates.js";

export async function kbMapGaps(
  config: KnowledgeBasePluginConfig,
  input: { limit?: number } = {},
): Promise<GapReport> {
  await validateRuntimeConfig(config);

  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("validation_error: limit must be a positive integer");
  }

  const { scannedNoteCount, candidates } = await collectGapCandidates(config);
  const limitedCandidates = candidates.slice(0, limit);

  return {
    ok: true,
    scanned_note_count: scannedNoteCount,
    candidate_counts: {
      concept: limitedCandidates.filter((candidate) => candidate.kind === "concept").length,
      entity: limitedCandidates.filter((candidate) => candidate.kind === "entity").length,
      synthesis: limitedCandidates.filter((candidate) => candidate.kind === "synthesis").length,
    },
    candidates: limitedCandidates,
  };
}
