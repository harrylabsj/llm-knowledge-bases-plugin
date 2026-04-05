import { buildDerivedNoteId } from "../core/naming.js";
import { validateRuntimeConfig } from "../core/validate.js";
import type {
  DerivedNoteKind,
  GapCandidate,
  GapPromotionResult,
  KnowledgeBasePluginConfig,
} from "../types.js";
import { collectGapCandidates } from "./gap_candidates.js";
import { kbUpsertDerivedNote } from "./kb_upsert_derived_note.js";

type PromoteGapSelector =
  | { noteId: string }
  | { kind: DerivedNoteKind; title: string };

function requireDerivedKind(value: string): DerivedNoteKind {
  if (value !== "concept" && value !== "entity" && value !== "synthesis") {
    throw new Error("validation_error: kind must be one of concept, entity, synthesis");
  }
  return value;
}

function requireSelector(input: {
  note_id?: string;
  kind?: string;
  title?: string;
}): PromoteGapSelector {
  const noteId = input.note_id?.trim();
  if (noteId) {
    return { noteId };
  }

  const title = input.title?.trim();
  const rawKind = input.kind?.trim();

  if (!title && !rawKind) {
    throw new Error("validation_error: provide note_id or kind + title");
  }
  if (!rawKind || !title) {
    throw new Error("validation_error: kind and title are both required when note_id is omitted");
  }

  return {
    kind: requireDerivedKind(rawKind),
    title,
  };
}

function findCandidate(candidates: GapCandidate[], selector: PromoteGapSelector): GapCandidate | undefined {
  if ("noteId" in selector) {
    return candidates.find((candidate) => candidate.suggested_note_id === selector.noteId);
  }

  const expectedNoteId = buildDerivedNoteId(selector.kind, selector.title);
  return candidates.find((candidate) => candidate.suggested_note_id === expectedNoteId);
}

export async function kbPromoteGap(
  config: KnowledgeBasePluginConfig,
  input: { note_id?: string; kind?: string; title?: string },
): Promise<GapPromotionResult> {
  await validateRuntimeConfig(config);

  const selector = requireSelector(input);
  const { candidates } = await collectGapCandidates(config);
  const candidate = findCandidate(candidates, selector);

  if (!candidate) {
    if ("noteId" in selector) {
      throw new Error(`not_found: no current gap candidate matches note_id "${selector.noteId}"`);
    }
    throw new Error(
      `not_found: no current gap candidate matches ${selector.kind} "${selector.title}"`,
    );
  }

  const writeResult = await kbUpsertDerivedNote(config, {
    markdown: candidate.draft.markdown,
  });

  return {
    ok: true,
    promoted_candidate: candidate,
    write_result: {
      ...writeResult,
      ok: true,
    },
  };
}
