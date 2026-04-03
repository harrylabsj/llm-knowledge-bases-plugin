import { describe, expect, it } from "vitest";

import { resolveCanonicalDocId } from "../src/core/manifest.js";
import type { ManifestFile } from "../src/types.js";

describe("manifest doc ids", () => {
  it("reuses existing doc ids", () => {
    const manifest: ManifestFile = {
      schema_version: 1,
      vault_root: "/tmp/vault",
      sources: {
        "raw/inbox/example.md": {
          doc_id: "src-example",
          raw_path: "raw/inbox/example.md",
          raw_hash: "sha256:abc",
          source_note_path: "wiki/sources/src-example.md",
          title: "Example",
          compiled_at: null,
          status: "compiled",
        },
      },
    };

    expect(resolveCanonicalDocId(manifest, "raw/inbox/example.md")).toBe("src-example");
  });

  it("creates collision-safe ids", () => {
    const manifest: ManifestFile = {
      schema_version: 1,
      vault_root: "/tmp/vault",
      sources: {
        "raw/inbox/example.md": {
          doc_id: "src-example",
          raw_path: "raw/inbox/example.md",
          raw_hash: "sha256:abc",
          source_note_path: "wiki/sources/src-example.md",
          title: "Example",
          compiled_at: null,
          status: "compiled",
        },
      },
    };

    expect(resolveCanonicalDocId(manifest, "raw/inbox/example-2.md")).toBe("src-example-2");
  });
});
