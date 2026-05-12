/**
 * Validates the vendor questionnaire entry URL to reduce phishing / open redirects.
 * Only HTTPS on Typeform-owned hosts; URL must reference the selected form id.
 */
export function assertAllowedVendorQuestionnaireBaseUrl(urlString: string, selectedFormId: string) {
  const formId = selectedFormId.trim();
  if (!formId) {
    throw new Error("Formulário inválido.");
  }

  let u: URL;
  try {
    u = new URL(urlString.trim());
  } catch {
    throw new Error("questionnaireBaseUrl inválida.");
  }

  if (u.protocol !== "https:") {
    throw new Error("questionnaireBaseUrl deve usar HTTPS.");
  }

  const host = u.hostname.toLowerCase();
  const allowedTypeformHosts = new Set(["form.typeform.com", "admin.typeform.com"]);
  if (!allowedTypeformHosts.has(host)) {
    throw new Error("questionnaireBaseUrl deve ser um domínio Typeform (ex.: form.typeform.com).");
  }

  const haystack = `${u.pathname}${u.search}`.toLowerCase();
  if (!haystack.includes(formId.toLowerCase())) {
    throw new Error("questionnaireBaseUrl não corresponde ao formulário selecionado.");
  }

  return urlString.trim().replace(/\/$/, "");
}
