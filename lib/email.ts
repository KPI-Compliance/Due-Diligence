import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { google } from "googleapis";
import { getIntegrationSettings, type TypeformConfig } from "@/lib/settings-data";

const LOCAL_GOOGLE_WORKSPACE_SERVICE_ACCOUNT_FILE =
  "/Users/jeff.brito/Library/CloudStorage/GoogleDrive-jeff.brito@vtex.com/Meu Drive/2026/Due Diligence System/jeffproject-489921-ea63feaab5ed.json";

type GoogleServiceAccount = {
  client_email?: string;
  private_key?: string;
};

let cachedEmbeddedLogoDataUri: string | null = null;

function normalizePrivateKey(value: string | undefined) {
  if (!value) return "";
  return value.replace(/\\n/g, "\n").trim();
}

function normalizeServiceAccount(raw: GoogleServiceAccount | null | undefined): GoogleServiceAccount {
  return {
    client_email: raw?.client_email?.trim() || "",
    private_key: normalizePrivateKey(raw?.private_key),
  };
}

async function getGoogleServiceAccountCredentials(): Promise<GoogleServiceAccount> {
  const rawJson = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    return normalizeServiceAccount(JSON.parse(rawJson) as GoogleServiceAccount);
  }

  const rawBase64 = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (rawBase64) {
    const decoded = Buffer.from(rawBase64, "base64").toString("utf8");
    return normalizeServiceAccount(JSON.parse(decoded) as GoogleServiceAccount);
  }

  const envClientEmail = process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL?.trim() || "";
  const envPrivateKey = normalizePrivateKey(process.env.GOOGLE_WORKSPACE_PRIVATE_KEY);
  if (envClientEmail && envPrivateKey) {
    return {
      client_email: envClientEmail,
      private_key: envPrivateKey,
    };
  }

  const filePath =
    process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_FILE?.trim() || LOCAL_GOOGLE_WORKSPACE_SERVICE_ACCOUNT_FILE;
  try {
    const rawFile = await readFile(filePath, "utf8");
    return normalizeServiceAccount(JSON.parse(rawFile) as GoogleServiceAccount);
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Credenciais Google Workspace ausentes no deploy. Configure GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON, GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64 ou GOOGLE_WORKSPACE_CLIENT_EMAIL/GOOGLE_WORKSPACE_PRIVATE_KEY.",
      );
    }
    throw error;
  }
}

async function getTypeformSenderEmail() {
  const settings = await getIntegrationSettings();
  const typeformSetting = settings.find((item) => item.provider === "TYPEFORM") as
    | { config: TypeformConfig }
    | undefined;

  return typeformSetting?.config.sender_email?.trim() || "";
}

async function getExternalQuestionnaireEmailTemplate() {
  const settings = await getIntegrationSettings();
  const typeformSetting = settings.find((item) => item.provider === "TYPEFORM") as
    | { config: TypeformConfig }
    | undefined;

  return (
    typeformSetting?.config.external_questionnaire_email_template?.trim() ||
    "[PT]\nOlá,\n\nComo parte do processo de compras da VTEX, realizamos a análise de Due Diligence de fornecedores.\n\nFormulário enviado: {{form_name}} ({{form_id}})\nAcesse o questionário: {{form_link}}\n\nEm caso de dúvidas, responda este e-mail.\n\n[EN]\nHello,\n\nAs part of VTEX procurement process, we perform vendors' Due Diligence analysis.\n\nSent form: {{form_name}} ({{form_id}})\nOpen questionnaire: {{form_link}}\n\nIf you have any questions, please reply to this email."
  );
}

async function getEmbeddedVtexLogoDataUri() {
  if (cachedEmbeddedLogoDataUri) {
    return cachedEmbeddedLogoDataUri;
  }

  try {
    const logoPath = join(process.cwd(), "public", "Logo_VTEX.png");
    const logoBytes = await readFile(logoPath);
    cachedEmbeddedLogoDataUri = `data:image/png;base64,${logoBytes.toString("base64")}`;
    return cachedEmbeddedLogoDataUri;
  } catch {
    try {
      const fallbackPath = join(process.cwd(), "public", "VTEX-Logo.png");
      const logoBytes = await readFile(fallbackPath);
      cachedEmbeddedLogoDataUri = `data:image/png;base64,${logoBytes.toString("base64")}`;
      return cachedEmbeddedLogoDataUri;
    } catch {
      return "";
    }
  }
}

async function getExternalQuestionnaireEmailSubject() {
  const settings = await getIntegrationSettings();
  const typeformSetting = settings.find((item) => item.provider === "TYPEFORM") as
    | { config: TypeformConfig }
    | undefined;

  return typeformSetting?.config.external_questionnaire_email_subject?.trim() || "VTEX | Due Diligence Analysis";
}

async function getExternalQuestionnaireEmailSignatureHtml() {
  const settings = await getIntegrationSettings();
  const typeformSetting = settings.find((item) => item.provider === "TYPEFORM") as
    | { config: TypeformConfig }
    | undefined;

  const rawSignature =
    typeformSetting?.config.external_questionnaire_email_signature_html?.trim() ||
    "<div style=\"margin-top:20px;padding-top:14px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;color:#111827;\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"width:100%;max-width:620px;\"><tr><td style=\"vertical-align:top;\"><p style=\"margin:0;font-size:24px;line-height:1.2;font-weight:700;color:#111827;\">SEC GRC Integrations</p><p style=\"margin:8px 0 0 0;font-size:14px;line-height:1.5;color:#1f2937;\">Official VTEX channel for vendor Due Diligence.</p><p style=\"margin:10px 0 0 0;font-size:14px;line-height:1.5;\"><a href=\"https://www.vtex.com\" target=\"_blank\" rel=\"noreferrer\" style=\"color:#0f4fd6;text-decoration:underline;\">www.vtex.com</a></p><div style=\"margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;\"><img src=\"{{logo_data_uri}}\" alt=\"VTEX\" style=\"height:26px;width:auto;display:block;\" /></div></td></tr></table></div>";
  const embeddedLogo = await getEmbeddedVtexLogoDataUri();
  const normalizedSignature = rawSignature
    .replace(/<td[^>]*>\s*<div[^>]*>\s*●\s*<\/div>\s*<\/td>/gi, "")
    .replace(/<p[^>]*>\s*Questions:\s*<a[^>]*>.*?<\/a>\s*<\/p>/gi, "");
  return normalizedSignature.replaceAll("{{logo_data_uri}}", embeddedLogo);
}

async function getGoogleWorkspaceSender() {
  const configuredSender = await getTypeformSenderEmail();
  const sender = configuredSender || process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER?.trim() || process.env.EMAIL_FROM?.trim();

  if (!sender) {
    throw new Error("Configure o e-mail remetente do Typeform ou defina GOOGLE_WORKSPACE_IMPERSONATED_USER no ambiente.");
  }

  return sender;
}

function toBase64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildFormLinkLabel(input: { formName: string; formId: string }) {
  const safeName = input.formName.trim() || "External Questionnaire";
  const safeId = input.formId.trim();
  return safeId ? `${safeName} (${safeId})` : safeName;
}

export async function sendExternalQuestionnaireEmail(input: {
  to: string[];
  cc?: string[];
  questionnaireUrl: string;
  formName: string;
  formId: string;
}) {
  const credentials = await getGoogleServiceAccountCredentials();
  const sender = await getGoogleWorkspaceSender();
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || sender;
  const subject = await getExternalQuestionnaireEmailSubject();
  const template = await getExternalQuestionnaireEmailTemplate();
  const signatureHtml = await getExternalQuestionnaireEmailSignatureHtml();

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Google Workspace service account credentials are incomplete.");
  }

  const renderedTemplate = template
    .replaceAll("{{form_link}}", input.questionnaireUrl)
    .replaceAll("{{form_name}}", input.formName)
    .replaceAll("{{form_id}}", input.formId);
  const linkLabel = buildFormLinkLabel({ formName: input.formName, formId: input.formId });
  const htmlBody = renderedTemplate
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const withLinks = escapeHtml(paragraph).replaceAll(
        escapeHtml(input.questionnaireUrl),
        `<a href="${input.questionnaireUrl}" target="_blank" rel="noreferrer">${escapeHtml(linkLabel)}</a>`,
      );
      return `<p>${withLinks.replaceAll("\n", "<br />")}</p>`;
    })
    .join("");

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    subject: sender,
  });

  const gmail = google.gmail({ version: "v1", auth });
  const ccRecipients = Array.isArray(input.cc)
    ? input.cc.map((item) => item.trim()).filter(Boolean)
    : [];
  const message = [
    `From: ${sender}`,
    `To: ${input.to.join(", ")}`,
    ...(ccRecipients.length > 0 ? [`Cc: ${ccRecipients.join(", ")}`] : []),
    `Reply-To: ${replyTo}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        ${htmlBody}
        ${signatureHtml}
      </div>
    `.trim(),
  ].join("\n");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: toBase64Url(message),
    },
  });
}
