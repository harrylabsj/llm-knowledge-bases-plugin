import { describe, expect, it } from "vitest";

import { slugify } from "../src/core/slug.js";

describe("slugify", () => {
  it("normalizes punctuation and whitespace", () => {
    expect(slugify("Agent Memory Systems!!!")).toBe("agent-memory-systems");
  });

  it("falls back to a stable unicode-safe slug for non-ascii titles", () => {
    expect(slugify("成为波伏瓦")).toMatch(/^u-[a-f0-9]{12}$/);
    expect(slugify("成为波伏瓦")).toBe(slugify("成为波伏瓦"));
  });

  it("falls back when input becomes empty", () => {
    expect(slugify("...")).toBe("untitled");
  });
});
