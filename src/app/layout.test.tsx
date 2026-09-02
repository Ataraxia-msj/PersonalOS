import { describe, expect, it } from "vitest";

import { metadata } from "./layout";

describe("root layout", () => {
  it("provides the Personal OS document metadata", () => {
    expect(metadata.title).toBe("Personal OS");
  });
});
