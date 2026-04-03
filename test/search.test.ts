import { describe, expect, it } from "vitest";

import { scoreTextQuery } from "../src/core/search.js";

describe("search scoring", () => {
  it("weights title matches above body matches", () => {
    const titleHeavy = scoreTextQuery({
      query: "example point",
      title: "Example Point",
      body: "This body mentions example once.",
    });
    const bodyHeavy = scoreTextQuery({
      query: "example point",
      title: "Unrelated Title",
      body: "Example point example point example point.",
    });

    expect(titleHeavy.score).toBeGreaterThan(bodyHeavy.score);
  });

  it("returns a snippet around the first match", () => {
    const result = scoreTextQuery({
      query: "critical",
      title: "Example",
      body: "This note has a critical detail that should appear in the snippet for search results.",
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.snippet.toLowerCase()).toContain("critical detail");
  });
});
