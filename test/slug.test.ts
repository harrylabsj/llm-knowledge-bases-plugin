import { describe, expect, it } from "vitest";

import { slugify } from "../src/core/slug.js";

describe("slugify", () => {
  it("normalizes punctuation and whitespace", () => {
    expect(slugify("Agent Memory Systems!!!")).toBe("agent-memory-systems");
  });

  it("falls back when input becomes empty", () => {
    expect(slugify("...")).toBe("untitled");
  });
});
