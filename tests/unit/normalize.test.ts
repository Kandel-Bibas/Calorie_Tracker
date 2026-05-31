import { describe, it, expect } from "vitest";
import { normalize } from "@/lib/normalize";

describe("normalize", () => {
  it("lowercases", () => {
    expect(normalize("Spaghetti")).toBe("spaghetti");
  });

  it("strips punctuation", () => {
    expect(normalize("Spaghetti, Cooked!!")).toBe("cooked spaghetti");
  });

  it("collapses whitespace", () => {
    expect(normalize("  rice   cooked  ")).toBe("cooked rice");
  });

  it("sorts tokens so word order is irrelevant", () => {
    expect(normalize("cooked spaghetti")).toBe(normalize("spaghetti cooked"));
  });

  it("strips diacritics from unicode food names", () => {
    expect(normalize("Café Latte")).toBe("cafe latte");
  });

  it("deduplicates tokens", () => {
    expect(normalize("chicken chicken breast")).toBe("breast chicken");
  });

  it("returns empty string for input with no alphanumeric", () => {
    expect(normalize("!!!---")).toBe("");
  });
});
