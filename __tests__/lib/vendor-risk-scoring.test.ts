import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/platform-settings", () => ({
  getPlatformSettings: vi.fn(),
  normalizeRiskScoringSettings: vi.fn(),
}));
vi.mock("@/lib/normalization", async (importOriginal) => importOriginal());

import {
  toDecisionLevel,
  normalizeEvaluation,
  inferVendorSection,
  getClassification,
  getSectionNote,
} from "@/lib/vendor-risk-scoring";
import type { RiskScoringProfile } from "@/lib/platform-settings";

const defaultSettings: RiskScoringProfile = {
  low_max: 40,
  medium_max: 70,
  fully_score: 100,
  partially_score: 50,
  does_not_meet_score: 0,
  security_weight: 1,
  privacy_weight: 1,
  compliance_weight: 0,
};

describe("toDecisionLevel", () => {
  it("returns null for null score", () => {
    expect(toDecisionLevel(null, defaultSettings)).toBeNull();
  });

  it("returns null for NaN score", () => {
    expect(toDecisionLevel(NaN, defaultSettings)).toBeNull();
  });

  it("returns LOW when score is at or below low_max", () => {
    expect(toDecisionLevel(0, defaultSettings)).toBe("LOW");
    expect(toDecisionLevel(40, defaultSettings)).toBe("LOW");
  });

  it("returns MEDIUM when score is above low_max and at or below medium_max", () => {
    expect(toDecisionLevel(41, defaultSettings)).toBe("MEDIUM");
    expect(toDecisionLevel(70, defaultSettings)).toBe("MEDIUM");
  });

  it("returns HIGH when score is above medium_max", () => {
    expect(toDecisionLevel(71, defaultSettings)).toBe("HIGH");
    expect(toDecisionLevel(100, defaultSettings)).toBe("HIGH");
  });
});

describe("normalizeEvaluation", () => {
  it("accepts valid evaluation values case-insensitively", () => {
    expect(normalizeEvaluation("FULLY", null)).toBe("FULLY");
    expect(normalizeEvaluation("partially", null)).toBe("PARTIALLY");
    expect(normalizeEvaluation("DOES_NOT_MEET", null)).toBe("DOES_NOT_MEET");
    expect(normalizeEvaluation("NA", null)).toBe("NA");
    expect(normalizeEvaluation("NOT_EVALUATED", null)).toBe("NOT_EVALUATED");
  });

  it("returns NOT_EVALUATED for unknown input", () => {
    expect(normalizeEvaluation("UNKNOWN_VALUE", null)).toBe("NOT_EVALUATED");
    expect(normalizeEvaluation(null, null)).toBe("NOT_EVALUATED");
    expect(normalizeEvaluation("", null)).toBe("NOT_EVALUATED");
  });

  it("returns NOT_EVALUATED when reviewStatus is NEEDS_REVIEW", () => {
    expect(normalizeEvaluation(null, "NEEDS_REVIEW")).toBe("NOT_EVALUATED");
  });

  it("returns NOT_EVALUATED when reviewStatus is COMPLIANT", () => {
    expect(normalizeEvaluation(null, "COMPLIANT")).toBe("NOT_EVALUATED");
  });
});

describe("inferVendorSection", () => {
  it("returns PRIVACY for privacy-related question text", () => {
    expect(inferVendorSection("Do you have a data protection policy?", "general")).toBe("PRIVACY");
    expect(inferVendorSection("Política de privacidade", "general")).toBe("PRIVACY");
    expect(inferVendorSection("LGPD compliance", "general")).toBe("PRIVACY");
  });

  it("returns PRIVACY when domain contains privacy hints", () => {
    expect(inferVendorSection("What controls exist?", "privacy")).toBe("PRIVACY");
    expect(inferVendorSection("Describe your process", "dados pessoais")).toBe("PRIVACY");
  });

  it("returns SECURITY for security-related question text", () => {
    expect(inferVendorSection("Do you have ISO 27001 certification?", "general")).toBe("SECURITY");
    expect(inferVendorSection("Describe your MFA policy", "general")).toBe("SECURITY");
    expect(inferVendorSection("Backup and disaster recovery", "general")).toBe("SECURITY");
  });

  it("returns SECURITY when domain contains security hints", () => {
    expect(inferVendorSection("Describe your process", "security")).toBe("SECURITY");
    expect(inferVendorSection("Tell us more", "seguranca")).toBe("SECURITY");
  });

  it("returns null for unrelated questions", () => {
    expect(inferVendorSection("What is your company name?", "general")).toBeNull();
    expect(inferVendorSection("Number of employees", "company")).toBeNull();
  });
});

describe("getClassification", () => {
  it("returns Pending Review when no section levels are provided", () => {
    expect(getClassification({ combinedScore: null, settings: defaultSettings, sectionLevels: [] })).toBe(
      "Pending Review",
    );
    expect(getClassification({ combinedScore: null, settings: defaultSettings, sectionLevels: [null] })).toBe(
      "Pending Review",
    );
  });

  it("returns High when any section is HIGH", () => {
    expect(
      getClassification({ combinedScore: 80, settings: defaultSettings, sectionLevels: ["HIGH", "LOW"] }),
    ).toBe("High");
  });

  it("returns Moderate when worst section is MEDIUM", () => {
    expect(
      getClassification({ combinedScore: 50, settings: defaultSettings, sectionLevels: ["MEDIUM", "LOW"] }),
    ).toBe("Moderate");
  });

  it("returns Low when all sections are LOW", () => {
    expect(
      getClassification({ combinedScore: 20, settings: defaultSettings, sectionLevels: ["LOW", "LOW"] }),
    ).toBe("Low");
  });

  it("uses worst-of-section vs combined score — combined HIGH overrides LOW sections", () => {
    expect(
      getClassification({ combinedScore: 80, settings: defaultSettings, sectionLevels: ["LOW"] }),
    ).toBe("High");
  });
});

describe("getSectionNote", () => {
  it("returns 'no answers' note when score is null", () => {
    expect(getSectionNote("SECURITY", 0, 0, null)).toContain("No scored security answers");
  });

  it("returns 'no answers' note when answeredCount is 0", () => {
    expect(getSectionNote("PRIVACY", 0, 10, 50)).toContain("No scored privacy answers");
  });

  it("returns 'no answers' note when totalWeight is 0 or negative", () => {
    expect(getSectionNote("SECURITY", 5, 0, 80)).toContain("No scored security answers");
  });

  it("returns calculated note with question count and weight when data is present", () => {
    const note = getSectionNote("PRIVACY", 3, 7.5, 60);
    expect(note).toContain("3");
    expect(note).toContain("7.5");
  });
});
