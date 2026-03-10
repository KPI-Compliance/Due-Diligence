import type { ReviewStatus } from "@/lib/entity-detail-data";

export type GoogleSheetsQuestion = {
  domain: string;
  status: ReviewStatus;
  question: string;
  answer: string;
  evidenceUrl?: string;
  source: "google_sheets";
};

type ReadParams = {
  assessmentId?: string | null;
  entitySlug: string;
  entityName: string;
};

function isEnabled() {
  return process.env.GOOGLE_SHEETS_ENABLED === "true";
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
  const isStrict = strictMatchEnabled();

  const candidates = rows
    .map((line) => {
      const rowAssessmentId = assessmentIdIdx >= 0 ? normalizeText(line[assessmentIdIdx]) : "";
      const rowEntitySlug = entitySlugIdx >= 0 ? normalizeComparable(line[entitySlugIdx]) : "";
      const rowEntityName = entityNameIdx >= 0 ? normalizeComparable(line[entityNameIdx]) : "";
      const rowCompanyName = companyIdx >= 0 ? normalizeComparable(line[companyIdx]) : "";
      const ts = submitDateIdx >= 0 ? toTimestamp(line[submitDateIdx]) : Number.MIN_SAFE_INTEGER;

      const byAssessmentId = Boolean(targetAssessmentId) && Boolean(rowAssessmentId) && rowAssessmentId === targetAssessmentId;
      const byEntitySlug = Boolean(targetSlug) && Boolean(rowEntitySlug) && rowEntitySlug === targetSlug;
      const byEntityName = Boolean(targetEntity) && Boolean(rowEntityName) && rowEntityName === targetEntity;
      const byCompanyName = Boolean(targetEntity) && Boolean(rowCompanyName) && rowCompanyName === targetEntity;

      return { line, ts, byAssessmentId, byEntitySlug, byEntityName, byCompanyName };
    })
    .filter((r) => r.byAssessmentId || r.byEntitySlug || r.byEntityName || r.byCompanyName);

  if (isStrict && candidates.length === 0) {
    console.warn("Google Sheets strict match enabled and no matching row was found.");
    return [];
  }

  const prioritized = candidates
    .sort((a, b) => {
      const scoreA =
        (a.byAssessmentId ? 8 : 0) + (a.byEntitySlug ? 4 : 0) + (a.byEntityName ? 2 : 0) + (a.byCompanyName ? 1 : 0);
      const scoreB =
        (b.byAssessmentId ? 8 : 0) + (b.byEntitySlug ? 4 : 0) + (b.byEntityName ? 2 : 0) + (b.byCompanyName ? 1 : 0);
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
}: ReadParams): Promise<GoogleSheetsQuestion[]> {
  if (!isEnabled()) return [];

  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL;
  if (!csvUrl) return [];

  try {
    const response = await fetch(csvUrl, { cache: "no-store" });
    if (!response.ok) {
      console.error(`Google Sheets fetch failed: ${response.status}`);
      return [];
    }

    const csv = await response.text();
    const rows = parseCsv(csv);
    if (rows.length < 2) return [];

    const rawHeader = rows[0];
    const dataRows = rows.slice(1);
    const normalizedHeader = rawHeader.map(normalizeHeader);

    const hasRowBasedShape =
      normalizedHeader.includes(normalizeHeader(process.env.GOOGLE_SHEETS_COLUMN_QUESTION ?? "question_text")) &&
      normalizedHeader.includes(normalizeHeader(process.env.GOOGLE_SHEETS_COLUMN_ANSWER ?? "answer_text"));

    if (hasRowBasedShape) {
      return parseRowBased(normalizedHeader, dataRows, { assessmentId, entitySlug, entityName });
    }

    return parseWideTypeformExport(rawHeader, dataRows, { assessmentId, entitySlug, entityName });
  } catch (error) {
    console.error("Google Sheets read failed", error);
    return [];
  }
}

export async function getGoogleSheetsHealth() {
  if (!isEnabled()) {
    return { ok: false, message: "GOOGLE_SHEETS_ENABLED=false" };
  }

  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL;
  if (!csvUrl) {
    return { ok: false, message: "GOOGLE_SHEETS_CSV_URL is not set." };
  }

  try {
    const response = await fetch(csvUrl, { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, message: `Fetch failed with status ${response.status}` };
    }

    const text = await response.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      return { ok: false, message: "Sheet is empty." };
    }

    return {
      ok: true,
      message: "Google Sheets connection is healthy.",
      rows: Math.max(rows.length - 1, 0),
      columns: rows[0].map(normalizeHeader),
    };
  } catch (error) {
    return { ok: false, message: `Error: ${(error as Error).message}` };
  }
}
