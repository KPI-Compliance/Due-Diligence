import { describe, it, expect } from "vitest";
import { assertAllowedVendorQuestionnaireBaseUrl } from "@/lib/questionnaire-url";

describe("assertAllowedVendorQuestionnaireBaseUrl", () => {
  const validFormId = "abc123";
  const validUrl = `https://form.typeform.com/to/${validFormId}`;

  it("accepts a valid form.typeform.com URL containing the form ID", () => {
    expect(assertAllowedVendorQuestionnaireBaseUrl(validUrl, validFormId)).toBe(validUrl);
  });

  it("strips trailing slash from a valid URL", () => {
    expect(assertAllowedVendorQuestionnaireBaseUrl(`${validUrl}/`, validFormId)).toBe(validUrl);
  });

  it("accepts admin.typeform.com as an allowed host", () => {
    const adminUrl = `https://admin.typeform.com/form/${validFormId}/share`;
    expect(assertAllowedVendorQuestionnaireBaseUrl(adminUrl, validFormId)).toBe(adminUrl);
  });

  it("throws when the URL is not HTTPS", () => {
    expect(() =>
      assertAllowedVendorQuestionnaireBaseUrl(`http://form.typeform.com/to/${validFormId}`, validFormId),
    ).toThrow("HTTPS");
  });

  it("throws when the host is not a Typeform-owned domain", () => {
    expect(() =>
      assertAllowedVendorQuestionnaireBaseUrl(`https://evil.typeform.com.attacker.io/to/${validFormId}`, validFormId),
    ).toThrow("Typeform");
  });

  it("throws for a non-Typeform HTTPS host", () => {
    expect(() =>
      assertAllowedVendorQuestionnaireBaseUrl(`https://example.com/to/${validFormId}`, validFormId),
    ).toThrow("Typeform");
  });

  it("throws when the URL does not include the form ID", () => {
    expect(() =>
      assertAllowedVendorQuestionnaireBaseUrl("https://form.typeform.com/to/differentId", validFormId),
    ).toThrow("formulário selecionado");
  });

  it("throws when the form ID is empty", () => {
    expect(() =>
      assertAllowedVendorQuestionnaireBaseUrl(validUrl, ""),
    ).toThrow("inválido");
  });

  it("throws when the form ID is only whitespace", () => {
    expect(() =>
      assertAllowedVendorQuestionnaireBaseUrl(validUrl, "   "),
    ).toThrow("inválido");
  });

  it("throws when the URL string is not a valid URL", () => {
    expect(() =>
      assertAllowedVendorQuestionnaireBaseUrl("not-a-url", validFormId),
    ).toThrow("inválida");
  });

  it("is case-insensitive when checking the form ID in the URL", () => {
    const upperFormId = "ABC123";
    const urlWithUpperId = `https://form.typeform.com/to/${upperFormId}`;
    expect(() =>
      assertAllowedVendorQuestionnaireBaseUrl(urlWithUpperId, validFormId),
    ).not.toThrow();
  });
});
