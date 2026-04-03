import matter from "gray-matter";
import { z } from "zod";

export const SOURCE_REQUIRED_HEADINGS = [
  "Summary",
  "Key Points",
  "Evidence",
  "Open Questions",
  "Related Links",
] as const;

export const OUTPUT_REQUIRED_HEADINGS = ["Answer", "Sources Used", "Follow-up Questions"] as const;

const sha256Schema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/, "must be a sha256 hash prefixed with sha256:");

const isoDateTimeSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.string().datetime({ offset: true }),
);

export const sourceNoteFrontmatterSchema = z
  .object({
    id: z.string().regex(/^src-[a-z0-9][a-z0-9-]*$/, "id must start with src-"),
    type: z.literal("source"),
    title: z.string().trim().min(1, "title is required"),
    raw_path: z.string().trim().min(1, "raw_path is required"),
    raw_hash: sha256Schema,
    source_kind: z.literal("raw_markdown"),
    tags: z.array(z.string()).optional().default([]),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
    status: z.string().trim().min(1, "status is required"),
  })
  .passthrough();

export const outputNoteFrontmatterSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^out-\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/,
        "id must match out-YYYY-MM-DD-<slug>",
      ),
    type: z.literal("output"),
    title: z.string().trim().min(1, "title is required"),
    query: z.string().trim().min(1, "query is required"),
    source_refs: z.array(z.string().trim().min(1)).min(1, "source_refs is required"),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
  })
  .passthrough();

export type SourceNoteFrontmatter = z.infer<typeof sourceNoteFrontmatterSchema>;
export type OutputNoteFrontmatter = z.infer<typeof outputNoteFrontmatterSchema>;

type ParsedNote<T> = {
  frontmatter: T;
  body: string;
};

function getFirstZodIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "invalid frontmatter";
}

function parseNoteMarkdown<TSchema extends z.ZodTypeAny>(
  markdown: string,
  schema: TSchema,
  label: string,
): ParsedNote<z.infer<TSchema>> {
  const parsed = matter(markdown);
  const result = schema.safeParse(parsed.data);

  if (!result.success) {
    throw new Error(`validation_error: invalid ${label} frontmatter: ${getFirstZodIssue(result.error)}`);
  }

  return {
    frontmatter: result.data,
    body: parsed.content,
  };
}

export function parseSourceNoteMarkdown(markdown: string): ParsedNote<SourceNoteFrontmatter> {
  return parseNoteMarkdown(markdown, sourceNoteFrontmatterSchema, "source note");
}

export function parseOutputNoteMarkdown(markdown: string): ParsedNote<OutputNoteFrontmatter> {
  return parseNoteMarkdown(markdown, outputNoteFrontmatterSchema, "output note");
}
