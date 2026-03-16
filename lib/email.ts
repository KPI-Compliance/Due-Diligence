import { readFile } from "node:fs/promises";
import { google } from "googleapis";
import { getIntegrationSettings, type TypeformConfig } from "@/lib/settings-data";

const LOCAL_GOOGLE_WORKSPACE_SERVICE_ACCOUNT_FILE =
  "/Users/jeff.brito/Library/CloudStorage/GoogleDrive-jeff.brito@vtex.com/Meu Drive/2026/Due Diligence System/jeffproject-489921-ea63feaab5ed.json";

type GoogleServiceAccount = {
  client_email?: string;
  private_key?: string;
};

async function getGoogleServiceAccountCredentials(): Promise<GoogleServiceAccount> {
  const rawJson = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    return JSON.parse(rawJson) as GoogleServiceAccount;
  }

  const filePath =
    process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_FILE?.trim() || LOCAL_GOOGLE_WORKSPACE_SERVICE_ACCOUNT_FILE;
  const rawFile = await readFile(filePath, "utf8");
  return JSON.parse(rawFile) as GoogleServiceAccount;
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
    "Olá,\n\nCompartilhamos abaixo o link do questionário externo para preenchimento:\n{{form_link}}\n\nFormulário selecionado: {{form_name}} ({{form_id}})\n\nAssim que o envio for concluído, seguiremos com a análise.\n\nObrigado."
  );
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

export async function sendExternalQuestionnaireEmail(input: {
  to: string[];
  questionnaireUrl: string;
  formName: string;
  formId: string;
}) {
  const credentials = await getGoogleServiceAccountCredentials();
  const sender = await getGoogleWorkspaceSender();
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || sender;
  const template = await getExternalQuestionnaireEmailTemplate();

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Google Workspace service account credentials are incomplete.");
  }

  const renderedTemplate = template
    .replaceAll("{{form_link}}", input.questionnaireUrl)
    .replaceAll("{{form_name}}", input.formName)
    .replaceAll("{{form_id}}", input.formId);
  const htmlBody = renderedTemplate
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const withLinks = escapeHtml(paragraph).replaceAll(
        escapeHtml(input.questionnaireUrl),
        `<a href="${input.questionnaireUrl}" target="_blank" rel="noreferrer">${escapeHtml(input.questionnaireUrl)}</a>`,
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
  const message = [
    `From: ${sender}`,
    `To: ${input.to.join(", ")}`,
    `Reply-To: ${replyTo}`,
    "Subject: Questionario externo de due diligence",
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        ${htmlBody}
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
