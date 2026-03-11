import { google } from "googleapis";
import type { ReviewStatus } from "@/lib/entity-detail-data";
import { getIntegrationSettings, type GoogleSheetsConfig } from "@/lib/settings-data";

export type GoogleSheetsQuestion = {
  domain: string;
  status: ReviewStatus;
  question: string;
  answer: string;
  evidenceUrl?: string;
  source: "google_sheets";
};

export type GoogleSheetsInternalQuestionnaire = {
  requester: string;
  ticket: string;
  vendor: string;
  status: string;
  submittedAt?: string;
  source: "google_sheets";
  questions: Array<{
    question: string;
    answer: string;
  }>;
};

type ReadParams = {
  assessmentId?: string | null;
  entitySlug: string;
  entityName: string;
  jiraTicket?: string | null;
  entityKind?: "VENDOR" | "PARTNER";
  typeformResponseToken?: string | null;
};

const reportedFetchIssues = new Set<string>();

function isEnabled() {
  return process.env.GOOGLE_SHEETS_ENABLED === "true";
}

function hasServiceAccountCredentials() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) && Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL);
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeComparable(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function toReviewStatus(raw: string | undefined): ReviewStatus {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return "needs_review";
  if (value === "compliant" || value === "ok" || value === "aprovado") return "compliant";
  if (value === "needs_review" || value === "in_review" || value === "pendente" || value === "revisao") {
    return "needs_review";
  }
  return "needs_review";
}

function normalizeText(value: string | undefined) {
  return (value ?? "").trim();
}

function normalizeLower(value: string | undefined) {
  return normalizeText(value).toLowerCase();
}

function inferDomain(question: string): string {
  const q = normalizeComparable(question);
  if (
    q.includes("privacy") ||
    q.includes("privacidade") ||
    q.includes("dados pessoais") ||
    q.includes("data subject") ||
    q.includes("transparency")
  ) {
    return "Privacy";
  }
  if (
    q.includes("security") ||
    q.includes("seguranca") ||
    q.includes("incident") ||
    q.includes("iam") ||
    q.includes("api") ||
    q.includes("pentest") ||
    q.includes("vulnerability") ||
    q.includes("encrypt") ||
    q.includes("criptograf") ||
    q.includes("pci") ||
    q.includes("sdlc") ||
    q.includes("audit")
  ) {
    return "Security";
  }
  return "Partner Questionnaire";
}

function toTimestamp(value: string | undefined): number {
  if (!value) return Number.MIN_SAFE_INTEGER;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.MIN_SAFE_INTEGER : parsed;
}

function strictMatchEnabled() {
  return process.env.GOOGLE_SHEETS_STRICT_MATCH !== "false";
}

function reportFetchIssueOnce(key: string, message: string) {
  if (reportedFetchIssues.has(key)) return;
  reportedFetchIssues.add(key);
  console.warn(message);
}

function parseSpreadsheetId(url: string) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

function toA1WorksheetRange(worksheetName: string) {
  const escaped = worksheetName.replace(/'/g, "''");
  return `'${escaped}'`;
}

async function getGoogleSheetsIntegrationConfig(): Promise<{ enabled: boolean; config: GoogleSheetsConfig } | null> {
  const settings = await getIntegrationSettings();
  const current = settings.find((item) => item.provider === "GOOGLE_SHEETS");
  if (!current) return null;
  return {
    enabled: current.enabled,
    config: current.config as GoogleSheetsConfig,
  };
}

async function readWorksheetValuesWithServiceAccount(spreadsheetUrl: string, worksheetName: string) {
  const spreadsheetId = parseSpreadsheetId(spreadsheetUrl);
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!spreadsheetId || !clientEmail || !privateKey) {
    return null;
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: toA1WorksheetRange(worksheetName),
  });

  const values = response.data.values;
  if (!values || values.length === 0) return [];
  return values.map((row) => row.map((cell) => String(cell ?? "")));
}

async function readConfiguredSheetRows(
  entityKind: "VENDOR" | "PARTNER",
  workflow: "internal_questionnaire" | "external_questionnaire",
) {
  const integration = await getGoogleSheetsIntegrationConfig();
  if (!integration?.enabled) return null;

  const spreadsheets = integration.config.spreadsheets.filter(
    (item) => item.entity_kind === entityKind && item.workflow === workflow && item.spreadsheet_url.trim(),
  );

  if (spreadsheets.length === 0) return null;

  if (!hasServiceAccountCredentials()) {
    reportFetchIssueOnce(
      `google-sheets-auth-missing-${entityKind}-${workflow}`,
      "Google Sheets configurado na aplicacao, mas as credenciais da service account nao estao definidas no ambiente.",
    );
    return null;
  }

  const results: string[][][] = [];
  for (const spreadsheet of spreadsheets) {
    try {
      const rows = await readWorksheetValuesWithServiceAccount(spreadsheet.spreadsheet_url, spreadsheet.worksheet_name);
      if (rows) {
        results.push(rows);
      }
    } catch (error) {
      reportFetchIssueOnce(
        `google-sheets-auth-read-${entityKind}-${workflow}-${spreadsheet.spreadsheet_url}-${spreadsheet.worksheet_name}`,
        `Google Sheets API read failed for ${entityKind}/${workflow}/${spreadsheet.worksheet_name}: ${(error as Error).message}`,
      );
    }
  }

  return results.length > 0 ? results : null;
}

async function readRowsFromCsvUrl(csvUrl: string, issuePrefix: string) {
  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      reportFetchIssueOnce(
        `${issuePrefix}-${response.status}-${csvUrl}`,
        `Google Sheets access returned ${response.status}. Publish the sheet or configure service account access for this URL.`,
      );
      return null;
    }

    reportFetchIssueOnce(`${issuePrefix}-${response.status}-${csvUrl}`, `Google Sheets fetch failed with status ${response.status}.`);
    return null;
  }

  const csv = await response.text();
  return parseCsv(csv);
}

function findComparableHeaderIndex(header: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeComparable);
  return header.findIndex((item) => normalizedCandidates.includes(normalizeComparable(item)));
}

function parseRowBased(
  header: string[],
  rows: string[][],
  params: ReadParams,
): GoogleSheetsQuestion[] {
  const col = {
    assessmentId: normalizeHeader(process.env.GOOGLE_SHEETS_COLUMN_ASSESSMENT_ID ?? "assessment_id"),
    entitySlug: normalizeHeader(process.env.GOOGLE_SHEETS_COLUMN_ENTITY_SLUG ?? "entity_slug"),
    entityName: normalizeHeader(process.env.GOOGLE_SHEETS_COLUMN_ENTITY_NAME ?? "entity_name"),
    domain: normalizeHeader(process.env.GOOGLE_SHEETS_COLUMN_DOMAIN ?? "domain"),
    question: normalizeHeader(process.env.GOOGLE_SHEETS_COLUMN_QUESTION ?? "question_text"),
    answer: normalizeHeader(process.env.GOOGLE_SHEETS_COLUMN_ANSWER ?? "answer_text"),
    reviewStatus: normalizeHeader(process.env.GOOGLE_SHEETS_COLUMN_REVIEW_STATUS ?? "review_status"),
    evidenceUrl: normalizeHeader(process.env.GOOGLE_SHEETS_COLUMN_EVIDENCE_URL ?? "evidence_url"),
  };

  const getCell = (line: string[], key: string) => {
    const idx = header.indexOf(key);
    if (idx < 0) return "";
    return line[idx] ?? "";
  };

  const normalizedAssessmentId = normalizeText(params.assessmentId ?? "");
  const normalizedSlug = normalizeLower(params.entitySlug);
  const normalizedName = normalizeLower(params.entityName);

  const results: GoogleSheetsQuestion[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const line = rows[i];
    const question = normalizeText(getCell(line, col.question));
    const answer = normalizeText(getCell(line, col.answer));
    if (!question && !answer) continue;

    const rowAssessmentId = normalizeText(getCell(line, col.assessmentId));
    const rowEntitySlug = normalizeLower(getCell(line, col.entitySlug));
    const rowEntityName = normalizeLower(getCell(line, col.entityName));

    const matchAssessment = Boolean(normalizedAssessmentId) && rowAssessmentId === normalizedAssessmentId;
    const matchEntity = rowEntitySlug === normalizedSlug || rowEntityName === normalizedName;
    if (!matchAssessment && !matchEntity) continue;

    const evidenceUrlRaw = normalizeText(getCell(line, col.evidenceUrl));
    const evidenceUrl = /^https?:\/\//i.test(evidenceUrlRaw) ? evidenceUrlRaw : undefined;

    results.push({
      domain: normalizeText(getCell(line, col.domain)) || inferDomain(question),
      status: toReviewStatus(getCell(line, col.reviewStatus)),
      question: question || "Pergunta sem texto",
      answer: answer || "Sem resposta preenchida na planilha.",
      evidenceUrl,
      source: "google_sheets",
    });
  }

  return results;
}

function parseWideTypeformExport(
  rawHeader: string[],
  rows: string[][],
  params: ReadParams,
): GoogleSheetsQuestion[] {
  const header = rawHeader.map((h) => h.trim());
  const normalized = header.map(normalizeComparable);

  const submitDateIdx = normalized.findIndex((h) => h === "submit date (utc)" || h === "submit_date_(utc)");
  const assessmentIdIdx = normalized.findIndex(
    (h) => h === normalizeComparable(process.env.GOOGLE_SHEETS_COLUMN_ASSESSMENT_ID ?? "assessment_id"),
  );
  const entitySlugIdx = normalized.findIndex(
    (h) => h === normalizeComparable(process.env.GOOGLE_SHEETS_COLUMN_ENTITY_SLUG ?? "entity_slug"),
  );
  const entityNameIdx = normalized.findIndex(
    (h) => h === normalizeComparable(process.env.GOOGLE_SHEETS_COLUMN_ENTITY_NAME ?? "entity_name"),
  );
  const tokenIdx = normalized.findIndex(
    (h) =>
      h === normalizeComparable(process.env.GOOGLE_SHEETS_COLUMN_TYPEFORM_TOKEN ?? "token") ||
      h === "response_token" ||
      h === "typeform_token",
  );

  const companyHeaderCandidates = [
    "olá! qual é o nome da empresa?",
    "ola! qual e o nome da empresa?",
    "hi! what is the company name?",
    "company_name",
    "nome_da_empresa",
  ];
  const companyIdx = normalized.findIndex((h) => companyHeaderCandidates.includes(h));

  const metadata = new Set([
    "#",
    "first name",
    "last name",
    "phone number",
    "email",
    "response type",
    "start date (utc)",
    "stage date (utc)",
    "submit date (utc)",
    "network id",
    "tags",
    "ending",
  ]);
  const metadataNormalized = new Set([...metadata].map(normalizeComparable));

  const questionIndexes = header
    .map((_, idx) => idx)
    .filter((idx) => {
      const name = normalized[idx];
      return !metadataNormalized.has(name) && name.length > 0;
    });

  if (questionIndexes.length === 0 || rows.length === 0) return [];

  const targetEntity = normalizeComparable(params.entityName);
  const targetSlug = normalizeComparable(params.entitySlug);
  const targetAssessmentId = normalizeText(params.assessmentId ?? "");
  const targetToken = normalizeText(params.typeformResponseToken ?? "");
  const isStrict = strictMatchEnabled();

  const candidates = rows
    .map((line) => {
      const rowAssessmentId = assessmentIdIdx >= 0 ? normalizeText(line[assessmentIdIdx]) : "";
      const rowEntitySlug = entitySlugIdx >= 0 ? normalizeComparable(line[entitySlugIdx]) : "";
      const rowEntityName = entityNameIdx >= 0 ? normalizeComparable(line[entityNameIdx]) : "";
      const rowCompanyName = companyIdx >= 0 ? normalizeComparable(line[companyIdx]) : "";
      const rowToken = tokenIdx >= 0 ? normalizeText(line[tokenIdx]) : "";
      const ts = submitDateIdx >= 0 ? toTimestamp(line[submitDateIdx]) : Number.MIN_SAFE_INTEGER;

      const byToken = Boolean(targetToken) && Boolean(rowToken) && rowToken === targetToken;
      const byAssessmentId = Boolean(targetAssessmentId) && Boolean(rowAssessmentId) && rowAssessmentId === targetAssessmentId;
      const byEntitySlug = Boolean(targetSlug) && Boolean(rowEntitySlug) && rowEntitySlug === targetSlug;
      const byEntityName = Boolean(targetEntity) && Boolean(rowEntityName) && rowEntityName === targetEntity;
      const byCompanyName = Boolean(targetEntity) && Boolean(rowCompanyName) && rowCompanyName === targetEntity;

      return { line, ts, byToken, byAssessmentId, byEntitySlug, byEntityName, byCompanyName };
    })
    .filter((r) => r.byToken || r.byAssessmentId || r.byEntitySlug || r.byEntityName || r.byCompanyName);

  if (isStrict && candidates.length === 0) {
    console.warn("Google Sheets strict match enabled and no matching row was found.");
    return [];
  }

  const prioritized = candidates
    .sort((a, b) => {
      const scoreA =
        (a.byToken ? 16 : 0) + (a.byAssessmentId ? 8 : 0) + (a.byEntitySlug ? 4 : 0) + (a.byEntityName ? 2 : 0) + (a.byCompanyName ? 1 : 0);
      const scoreB =
        (b.byToken ? 16 : 0) + (b.byAssessmentId ? 8 : 0) + (b.byEntitySlug ? 4 : 0) + (b.byEntityName ? 2 : 0) + (b.byCompanyName ? 1 : 0);
      return scoreB - scoreA || b.ts - a.ts;
    });

  const best = prioritized[0] ?? rows.map((line) => ({ line, ts: submitDateIdx >= 0 ? toTimestamp(line[submitDateIdx]) : 0 })).sort((a, b) => b.ts - a.ts)[0];

  if (!best) return [];

  const result: GoogleSheetsQuestion[] = [];
  for (const idx of questionIndexes) {
    const question = normalizeText(header[idx]);
    const answer = normalizeText(best.line[idx]);
    if (!question || !answer) continue;

    const evidenceUrl = /^https?:\/\//i.test(answer) ? answer : undefined;
    result.push({
      domain: inferDomain(question),
      status: "needs_review",
      question,
      answer,
      evidenceUrl,
      source: "google_sheets",
    });
  }

  return result;
}

export async function readAssessmentQuestionsFromGoogleSheets({
  assessmentId,
  entitySlug,
  entityName,
  entityKind,
  typeformResponseToken,
}: ReadParams): Promise<GoogleSheetsQuestion[]> {
  if (!isEnabled()) return [];

  try {
    const configuredSheets =
      entityKind ? await readConfiguredSheetRows(entityKind, "external_questionnaire") : null;
    const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL;
    const candidateSheets = configuredSheets ?? (csvUrl ? [await readRowsFromCsvUrl(csvUrl, "assessment")] : []);

    for (const rows of candidateSheets) {
      if (!rows || rows.length < 2) continue;

      const rawHeader = rows[0];
      const dataRows = rows.slice(1);
      const normalizedHeader = rawHeader.map(normalizeHeader);

      const hasRowBasedShape =
        normalizedHeader.includes(normalizeHeader(process.env.GOOGLE_SHEETS_COLUMN_QUESTION ?? "question_text")) &&
        normalizedHeader.includes(normalizeHeader(process.env.GOOGLE_SHEETS_COLUMN_ANSWER ?? "answer_text"));

      const parsed = hasRowBasedShape
        ? parseRowBased(normalizedHeader, dataRows, { assessmentId, entitySlug, entityName, typeformResponseToken })
        : parseWideTypeformExport(rawHeader, dataRows, { assessmentId, entitySlug, entityName, typeformResponseToken });

      if (parsed.length > 0) {
        return parsed;
      }
    }

    return [];
  } catch (error) {
    reportFetchIssueOnce("assessment-read-error", `Google Sheets questionnaire read failed: ${(error as Error).message}`);
    return [];
  }
}

export async function readInternalQuestionnaireFromGoogleSheets({
  jiraTicket,
  entitySlug,
  entityName,
  entityKind,
}: Omit<ReadParams, "assessmentId">): Promise<GoogleSheetsInternalQuestionnaire | null> {
  if (!isEnabled()) return null;

  try {
    const configuredSheets =
      entityKind ? await readConfiguredSheetRows(entityKind, "internal_questionnaire") : null;
    const csvUrl = process.env.GOOGLE_SHEETS_INTERNAL_CSV_URL ?? process.env.GOOGLE_SHEETS_CSV_URL;
    const candidateSheets = configuredSheets ?? (csvUrl ? [await readRowsFromCsvUrl(csvUrl, "internal")] : []);

    for (const rows of candidateSheets) {
      if (!rows || rows.length < 2) continue;

      const header = rows[0].map((value) => value.trim());
      const dataRows = rows.slice(1);

      const vendorIdx = findComparableHeaderIndex(header, [
        process.env.GOOGLE_SHEETS_INTERNAL_COLUMN_VENDOR ?? "vendor",
        "company_name",
        "nome da empresa",
      ]);
      const ticketIdx = findComparableHeaderIndex(header, [
        process.env.GOOGLE_SHEETS_INTERNAL_COLUMN_TICKET ?? "ticket",
        "jira ticket",
        "id do ticket do jira",
      ]);
      const requesterIdx = findComparableHeaderIndex(header, [
        process.env.GOOGLE_SHEETS_INTERNAL_COLUMN_REQUESTER ?? "solicitado por",
        "requested by",
        "ponto focal vtex",
        "quem e o ponto focal vtex (para quem enviar o questionario)?",
        "quem é o ponto focal vtex (para quem enviar o questionário)?",
      ]);
      const statusIdx = findComparableHeaderIndex(header, [
        process.env.GOOGLE_SHEETS_INTERNAL_COLUMN_STATUS ?? "status mini questionario",
        "status mini questionário",
        "status",
      ]);
      const submitDateIdx = findComparableHeaderIndex(header, [
        "submit date (utc)",
        "submit_date_(utc)",
        "data de envio",
        "submitted_at",
      ]);

      if (vendorIdx < 0) continue;

      const questionIndexes = header
        .map((_, idx) => idx)
        .filter((idx) => ![vendorIdx, ticketIdx, requesterIdx, statusIdx, submitDateIdx].includes(idx));

      const targetEntity = normalizeComparable(entityName);
      const targetSlug = normalizeComparable(entitySlug);
      const targetTicket = normalizeText(jiraTicket ?? "");
      const isStrict = strictMatchEnabled();

      const candidates = dataRows
        .map((line, index) => {
          const rowVendor = normalizeComparable(line[vendorIdx]);
          const rowTicket = ticketIdx >= 0 ? normalizeText(line[ticketIdx]) : "";
          const rowRequester = requesterIdx >= 0 ? normalizeText(line[requesterIdx]) : "";
          const rowStatus = statusIdx >= 0 ? normalizeText(line[statusIdx]) : "";
          const ts = submitDateIdx >= 0 ? toTimestamp(line[submitDateIdx]) : index;

          const byTicket = Boolean(targetTicket) && Boolean(rowTicket) && rowTicket === targetTicket;
          const byVendor = Boolean(targetEntity) && rowVendor === targetEntity;
          const bySlug = Boolean(targetSlug) && rowVendor === targetSlug;

          return { line, ts, byTicket, byVendor, bySlug, rowTicket, rowRequester, rowStatus };
        })
        .filter((item) => item.byTicket || item.byVendor || item.bySlug);

      if (isStrict && candidates.length === 0) {
        continue;
      }

      const best =
        candidates.sort((a, b) => {
          const scoreA = (a.byTicket ? 4 : 0) + (a.byVendor ? 2 : 0) + (a.bySlug ? 1 : 0);
          const scoreB = (b.byTicket ? 4 : 0) + (b.byVendor ? 2 : 0) + (b.bySlug ? 1 : 0);
          return scoreB - scoreA || b.ts - a.ts;
        })[0] ??
        dataRows[dataRows.length - 1]
          ? {
              line: dataRows[dataRows.length - 1],
              ts: dataRows.length - 1,
              byTicket: false,
              byVendor: false,
              bySlug: false,
              rowTicket: ticketIdx >= 0 ? normalizeText(dataRows[dataRows.length - 1][ticketIdx]) : "",
              rowRequester: requesterIdx >= 0 ? normalizeText(dataRows[dataRows.length - 1][requesterIdx]) : "",
              rowStatus: statusIdx >= 0 ? normalizeText(dataRows[dataRows.length - 1][statusIdx]) : "",
            }
          : null;

      if (!best) continue;

      const questions = questionIndexes
        .map((idx) => ({
          question: normalizeText(header[idx]),
          answer: normalizeText(best.line[idx]),
        }))
        .filter((item) => item.question && item.answer);

      return {
        requester: best.rowRequester || "-",
        ticket: best.rowTicket || targetTicket || "-",
        vendor: normalizeText(best.line[vendorIdx]) || entityName,
        status: best.rowStatus || (questions.length > 0 ? "Concluído" : "Pendente"),
        submittedAt: submitDateIdx >= 0 ? normalizeText(best.line[submitDateIdx]) : undefined,
        source: "google_sheets",
        questions,
      };
    }

    if (strictMatchEnabled()) {
      console.warn("Google Sheets strict match enabled and no matching internal questionnaire row was found.");
    }

    return null;
  } catch (error) {
    reportFetchIssueOnce("internal-read-error", `Google Sheets internal questionnaire read failed: ${(error as Error).message}`);
    return null;
  }
}

export async function getGoogleSheetsHealth() {
  if (!isEnabled()) {
    return { ok: false, message: "GOOGLE_SHEETS_ENABLED=false" };
  }

  const integration = await getGoogleSheetsIntegrationConfig();
  const configuredSheet = integration?.config.spreadsheets[0];
  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL;

  if (!configuredSheet?.spreadsheet_url && !csvUrl) {
    return { ok: false, message: "No Google Sheets source configured." };
  }

  try {
    const rows =
      configuredSheet?.spreadsheet_url
      ? await readWorksheetValuesWithServiceAccount(configuredSheet.spreadsheet_url, configuredSheet.worksheet_name)
      : csvUrl
        ? await readRowsFromCsvUrl(csvUrl, "health")
        : null;
    if (!rows) {
      return { ok: false, message: "Unable to read rows from configured Google Sheets source." };
    }
    if (rows.length === 0) {
      return { ok: false, message: "Sheet is empty." };
    }

    return {
      ok: true,
      message: configuredSheet?.spreadsheet_url ? "Google Sheets API connection is healthy." : "Google Sheets CSV connection is healthy.",
      rows: Math.max(rows.length - 1, 0),
      columns: rows[0].map(normalizeHeader),
    };
  } catch (error) {
    return { ok: false, message: `Error: ${(error as Error).message}` };
  }
}
