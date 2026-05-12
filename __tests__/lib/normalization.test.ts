import { describe, it, expect } from "vitest";
import { normalizeComparable, normalizeLooseLookup } from "@/lib/normalization";

describe("normalizeComparable", () => {
  it("strips accents from characters", () => {
    expect(normalizeComparable("Açaí")).toBe("acai");
    expect(normalizeComparable("ção")).toBe("cao");
    expect(normalizeComparable("résumé")).toBe("resume");
  });

  it("lowercases the result", () => {
    expect(normalizeComparable("HELLO")).toBe("hello");
    expect(normalizeComparable("CamelCase")).toBe("camelcase");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeComparable("  hello  ")).toBe("hello");
  });

  it("returns empty string for null", () => {
    expect(normalizeComparable(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeComparable(undefined)).toBe("");
  });

  it("handles empty string", () => {
    expect(normalizeComparable("")).toBe("");
  });

  it("preserves non-accent special characters", () => {
    expect(normalizeComparable("hello-world")).toBe("hello-world");
  });
});

describe("normalizeLooseLookup", () => {
  it("removes non-alphanumeric characters and normalizes accents", () => {
    expect(normalizeLooseLookup("Açaí Corp.")).toBe("acai corp");
  });

  it("collapses multiple spaces into one", () => {
    expect(normalizeLooseLookup("hello   world")).toBe("hello world");
  });

  it("strips punctuation", () => {
    expect(normalizeLooseLookup("foo, bar! baz.")).toBe("foo bar baz");
  });

  it("returns empty string for null", () => {
    expect(normalizeLooseLookup(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeLooseLookup(undefined)).toBe("");
  });

  it("handles a company name with accents and punctuation", () => {
    const result = normalizeLooseLookup("Empresa Ltda. (São Paulo)");
    expect(result).toBe("empresa ltda sao paulo");
  });
});
