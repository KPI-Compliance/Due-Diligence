import { sql } from "@/lib/db";
import type { DetailTabKey, EntityDetailData, RiskLevel } from "@/lib/entity-detail-data";
import { readInternalQuestionnaireFromGoogleSheets } from "@/lib/google-sheets";

type UiStatus = "pending" | "sent" | "responded" | "in_review" | "completed";

type UiRisk = "Low" | "Medium" | "High" | "Critical";

type UiKind = "Vendor" | "Partner";

function mapStatus(status: string): UiStatus {
  const normalized = status.toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "sent") return "sent";
  if (normalized === "responded") return "responded";
  if (normalized === "in_review") return "in_review";
  return "completed";
}

function mapStatusNullable(status: string | null): UiStatus | null {
  if (!status) return null;
  return mapStatus(status);
}

function mapRisk(level: string | null): UiRisk {
  if (!level) return "Low";
  const normalized = level.toLowerCase();
  if (normalized === "critical") return "Critical";
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  return "Low";
}

function riskClasses(level: UiRisk) {
  if (level === "Critical") {
    return { riskClass: "text-rose-600", riskDot: "bg-rose-500" };
  }
  if (level === "High") {
    return { riskClass: "text-red-600", riskDot: "bg-red-500" };
  }
  if (level === "Medium") {
    return { riskClass: "text-amber-600", riskDot: "bg-amber-500" };
  }
  return { riskClass: "text-emerald-600", riskDot: "bg-emerald-500" };
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDateNumeric(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function toTitleCase(value: string) {
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function toUiKind(kind: string): UiKind {
  return kind.toLowerCase() === "partner" ? "Partner" : "Vendor";
}

function toCompanyGroup(value: string) {
  return value.toUpperCase() === "WENI" ? "WENI" : "VTEX";
}

function toWorkflowStatus(status: string | null): UiStatus | null {
  if (!status) return null;
  return mapStatus(status);
}

function hasDualReview(privacyLevel: string | null, securityLevel: string | null) {
  return Boolean(privacyLevel && securityLevel);
}

function mapVendorIntakeStatus(status: string | null, privacyLevel: string | null, securityLevel: string | null) {
  const workflowStatus = toWorkflowStatus(status);
  if (!workflowStatus || workflowStatus === "pending") return "Pending";
  if (workflowStatus === "sent") return "Sent";
  if (hasDualReview(privacyLevel, securityLevel)) return "Reviewed";
  return "Responded";
}

function mapPartnerAssessmentStatus(status: string | null) {
  const workflowStatus = toWorkflowStatus(status);
  if (!workflowStatus || workflowStatus === "pending" || workflowStatus === "sent") return "Pending";
  if (workflowStatus === "responded" || workflowStatus === "in_review") return "In Review";
  return "Completed";
}

function mapTechnicalReviewStatus(status: string | null) {
  const workflowStatus = toWorkflowStatus(status);
  if (workflowStatus === "in_review" || workflowStatus === "completed") return "Sent";
  return "Not Sent";
}

function mapMainQuestionnaireStatus(questionCount: number, privacyLevel: string | null, securityLevel: string | null) {
  if (questionCount <= 0) return "Pending";
  if (hasDualReview(privacyLevel, securityLevel)) return "Reviewed";
  return "Responded";
}

function compareRiskSeverity(level: UiRisk) {
  if (level === "Critical") return 4;
  if (level === "High") return 3;
  if (level === "Medium") return 2;
  return 1;
}

function maxRisk(...levels: Array<string | null>) {
  return levels.map(mapRisk).sort((a, b) => compareRiskSeverity(b) - compareRiskSeverity(a))[0] ?? "Low";
}

function mapDecisionRisk(level: string | null) {
  return level ? mapRisk(level) : null;
}

function resolvePartnerFinalRisk(
  status: string | null,
  securityLevel: string | null,
  privacyLevel: string | null,
  complianceLevel: string | null,
  fallbackRisk: string | null,
) {
  const workflowStatus = toWorkflowStatus(status);
  const hasAnyDecision = Boolean(securityLevel || privacyLevel || complianceLevel);

  if (!hasAnyDecision && (!workflowStatus || workflowStatus === "pending" || workflowStatus === "sent" || workflowStatus === "responded")) {
    return null;
  }

  return maxRisk(securityLevel, privacyLevel, complianceLevel, fallbackRisk);
}

function mapPartnerQuestionSection(section: string | null | undefined): "Common" | "Compliance" | "Privacy" | "Security" | "Unclassified" {
  const normalized = (section ?? "").trim().toUpperCase();
  if (normalized === "COMMON") return "Common";
  if (normalized === "COMPLIANCE") return "Compliance";
  if (normalized === "PRIVACY") return "Privacy";
  if (normalized === "SECURITY") return "Security";
  return "Unclassified";
}

function normalizePartnerQuestionLookup(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function cleanOverviewValue(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function cleanOverviewWebsite(value: string | null | undefined) {
  const normalized = cleanOverviewValue(value);
  if (!normalized) return null;
  return normalized.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function normalizeDecimal(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function findCommonAnswerValue(
  questions: Array<{ question: string; answer: string; questionKey?: string | null }>,
  aliases: string[],
) {
  const normalizedAliases = aliases.map((alias) => normalizePartnerQuestionLookup(alias));

  for (const item of questions) {
    const questionText = normalizePartnerQuestionLookup(item.question);
    const questionKey = normalizePartnerQuestionLookup(item.questionKey);
    const matches = normalizedAliases.some(
      (alias) =>
        questionText === alias ||
        questionKey === alias ||
        questionText.includes(alias) ||
        questionKey.includes(alias),
    );

    if (!matches) continue;

    const answer = cleanOverviewValue(item.answer);
    if (answer) return answer;
  }

  return null;
}

function derivePartnerOverviewFromCommonQuestions(
  questions: Array<{ question: string; answer: string; questionKey?: string | null }>,
) {
  const firstName = findCommonAnswerValue(questions, [
    "first name",
    "contact first name",
    "partner first name",
    "nome",
    "primeiro nome",
    "nome do contato",
  ]);
  const lastName = findCommonAnswerValue(questions, [
    "last name",
    "contact last name",
    "partner last name",
    "sobrenome",
    "ultimo nome",
    "apelido",
  ]);
  const phoneNumber = findCommonAnswerValue(questions, [
    "phone number",
    "contact phone number",
    "partner phone number",
    "phone",
    "telefone",
    "telefone de contato",
    "celular",
    "mobile",
  ]);
  const email = findCommonAnswerValue(questions, [
    "email",
    "contact email",
    "company email",
    "partner email",
    "business email",
    "email de contato",
    "e mail de contato",
    "e mail",
  ]);

  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
  return {
    contactName: fullName,
    contactPhone: phoneNumber,
    contactEmail: email,
    category: findCommonAnswerValue(questions, [
      "category",
      "company category",
      "partner category",
      "segment",
      "segmento",
      "categoria",
      "industry",
      "industry segment",
      "market segment",
      "partner type",
      "tipo de parceiro",
    ]),
    hqLocation: findCommonAnswerValue(questions, [
      "hq location",
      "headquarter",
      "headquarters",
      "company headquarters",
      "where is your company headquartered",
      "hq country",
      "localizacao da sede",
      "localizacao da matriz",
      "sede da empresa",
      "pais da sede",
    ]),
    website: cleanOverviewWebsite(
      findCommonAnswerValue(questions, [
        "website",
        "company website",
        "website url",
        "company url",
        "site",
        "site da empresa",
        "website da empresa",
        "url",
      ]),
    ),
    contact: [fullName, phoneNumber, email].filter(Boolean).join(" | ") || null,
    description: findCommonAnswerValue(questions, [
      "company description",
      "description",
      "about the company",
      "company overview",
      "describe your company",
      "what does the company do",
      "descricao da empresa",
      "sobre a empresa",
      "fale sobre a empresa",
      "o que a empresa faz",
    ]),
  };
}

function resolvePartnerFormResponseTable(formName: string | null | undefined) {
  const normalized = (formName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  switch (normalized) {
    case "vtex partner assessment ptbr":
      return "partner_typeform_assessment_ptbr_responses";
    case "vtex partner assessment en":
      return "partner_typeform_assessment_en_responses";
    case "vtex partner assessment pt (v2)":
      return "partner_typeform_assessment_pt_v2_responses";
    case "vtex partner assessment en (v2)":
      return "partner_typeform_assessment_en_v2_responses";
    default:
      return null;
  }
}

const partnerResponseTables = [
  "partner_typeform_assessment_ptbr_responses",
  "partner_typeform_assessment_en_responses",
  "partner_typeform_assessment_pt_v2_responses",
  "partner_typeform_assessment_en_v2_responses",
] as const;

type PartnerResponseTableName = (typeof partnerResponseTables)[number];

function getPartnerFormNameFromTable(tableName: PartnerResponseTableName) {
  switch (tableName) {
    case "partner_typeform_assessment_ptbr_responses":
      return "VTEX Partner Assessment PTBR";
    case "partner_typeform_assessment_en_responses":
      return "VTEX Partner Assessment EN";
    case "partner_typeform_assessment_pt_v2_responses":
      return "VTEX Partner Assessment PT (V2)";
    case "partner_typeform_assessment_en_v2_responses":
      return "VTEX Partner Assessment EN (V2)";
  }
}

async function getTypeformQuestionSectionOverrides(typeformFormId: string | null | undefined) {
  if (!typeformFormId) {
    return new Map<string, string>();
  }

  try {
    const rows = (await sql`
      SELECT
        m.question_key,
        m.question_text,
        m.section::text
      FROM typeform_form_question_mappings m
      JOIN typeform_forms f
        ON f.id = m.typeform_form_config_id
      WHERE f.form_id = ${typeformFormId}
    `) as Array<{
      question_key: string;
      question_text: string;
      section: string;
    }>;

    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.question_key) {
        map.set(`key:${row.question_key}`, row.section);
      }
      if (row.question_text) {
        map.set(`text:${row.question_text.trim().toLowerCase()}`, row.section);
      }
    }
    return map;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01" || code === "42704") {
      return new Map<string, string>();
    }
    throw error;
  }
}

async function getPartnerFormQuestionRows(tableName: string, assessmentId: string) {
  if (tableName === "partner_typeform_assessment_ptbr_responses") {
    return (await sql`
      SELECT
        id::text,
        typeform_form_id,
        section::text,
        question_key,
        question_text,
        answer_text,
        analyst_evaluation::text,
        analyst_observations
      FROM partner_typeform_assessment_ptbr_responses
      WHERE assessment_id = ${assessmentId}::uuid
      ORDER BY question_order ASC, created_at ASC
    `) as Array<{
      id: string;
      typeform_form_id: string | null;
      section: string | null;
      question_key: string | null;
      question_text: string;
      answer_text: string | null;
      analyst_evaluation: string | null;
      analyst_observations: string | null;
    }>;
  }

  if (tableName === "partner_typeform_assessment_en_responses") {
    return (await sql`
      SELECT
        id::text,
        typeform_form_id,
        section::text,
        question_key,
        question_text,
        answer_text,
        analyst_evaluation::text,
        analyst_observations
      FROM partner_typeform_assessment_en_responses
      WHERE assessment_id = ${assessmentId}::uuid
      ORDER BY question_order ASC, created_at ASC
    `) as Array<{
      id: string;
      typeform_form_id: string | null;
      section: string | null;
      question_key: string | null;
      question_text: string;
      answer_text: string | null;
      analyst_evaluation: string | null;
      analyst_observations: string | null;
    }>;
  }

  if (tableName === "partner_typeform_assessment_en_v2_responses") {
    return (await sql`
      SELECT
        id::text,
        typeform_form_id,
        section::text,
        question_key,
        question_text,
        answer_text,
        analyst_evaluation::text,
        analyst_observations
      FROM partner_typeform_assessment_en_v2_responses
      WHERE assessment_id = ${assessmentId}::uuid
      ORDER BY question_order ASC, created_at ASC
    `) as Array<{
      id: string;
      typeform_form_id: string | null;
      section: string | null;
      question_key: string | null;
      question_text: string;
      answer_text: string | null;
      analyst_evaluation: string | null;
      analyst_observations: string | null;
    }>;
  }

  return (await sql`
    SELECT
      id::text,
      typeform_form_id,
      section::text,
      question_key,
      question_text,
      answer_text,
      analyst_evaluation::text,
      analyst_observations
    FROM partner_typeform_assessment_pt_v2_responses
    WHERE assessment_id = ${assessmentId}::uuid
    ORDER BY question_order ASC, created_at ASC
  `) as Array<{
    id: string;
    typeform_form_id: string | null;
    section: string | null;
    question_key: string | null;
    question_text: string;
    answer_text: string | null;
    analyst_evaluation: string | null;
    analyst_observations: string | null;
  }>;
}

async function getPartnerExistingResponseSource(input: {
  assessmentId?: string | null;
  responseToken?: string | null;
  companyName: string;
}) {
  for (const tableName of partnerResponseTables) {
    let rows: Awaited<ReturnType<typeof getPartnerFormQuestionRows>> = [];

    if (input.assessmentId) {
      rows = await getPartnerFormQuestionRows(tableName, input.assessmentId);
    }
    if (rows.length === 0 && input.responseToken) {
      rows = await getPartnerFormQuestionRowsByToken(tableName, input.responseToken);
    }
    if (rows.length === 0) {
      rows = await getPartnerFormQuestionRowsByCompany(tableName, input.companyName);
    }

    if (rows.length > 0) {
      const firstWithForm = rows.find((row) => row.typeform_form_id);
      const resolvedFormId = firstWithForm?.typeform_form_id ?? null;
      let resolvedFormName = getPartnerFormNameFromTable(tableName);

      if (resolvedFormId) {
        const formRows = (await sql`
          SELECT name
          FROM typeform_forms
          WHERE form_id = ${resolvedFormId}
          LIMIT 1
        `) as Array<{ name: string }>;
        resolvedFormName = formRows[0]?.name ?? resolvedFormName;
      }

      return {
        tableName,
        rows,
        formId: resolvedFormId,
        formName: resolvedFormName,
      };
    }
  }

  return null;
}

async function getPartnerFormQuestionRowsByToken(tableName: string, responseToken: string) {
  if (tableName === "partner_typeform_assessment_ptbr_responses") {
    return (await sql`
      SELECT id::text, typeform_form_id, section::text, question_key, question_text, answer_text, analyst_evaluation::text, analyst_observations
      FROM partner_typeform_assessment_ptbr_responses
      WHERE typeform_response_token = ${responseToken}
      ORDER BY question_order ASC, created_at ASC
    `) as Array<{
      id: string;
      typeform_form_id: string | null;
      section: string | null;
      question_key: string | null;
      question_text: string;
      answer_text: string | null;
      analyst_evaluation: string | null;
      analyst_observations: string | null;
    }>;
  }

  if (tableName === "partner_typeform_assessment_en_responses") {
    return (await sql`
      SELECT id::text, typeform_form_id, section::text, question_key, question_text, answer_text, analyst_evaluation::text, analyst_observations
      FROM partner_typeform_assessment_en_responses
      WHERE typeform_response_token = ${responseToken}
      ORDER BY question_order ASC, created_at ASC
    `) as Array<{
      id: string;
      typeform_form_id: string | null;
      section: string | null;
      question_key: string | null;
      question_text: string;
      answer_text: string | null;
      analyst_evaluation: string | null;
      analyst_observations: string | null;
    }>;
  }

  if (tableName === "partner_typeform_assessment_en_v2_responses") {
    return (await sql`
      SELECT id::text, typeform_form_id, section::text, question_key, question_text, answer_text, analyst_evaluation::text, analyst_observations
      FROM partner_typeform_assessment_en_v2_responses
      WHERE typeform_response_token = ${responseToken}
      ORDER BY question_order ASC, created_at ASC
    `) as Array<{
      id: string;
      typeform_form_id: string | null;
      section: string | null;
      question_key: string | null;
      question_text: string;
      answer_text: string | null;
      analyst_evaluation: string | null;
      analyst_observations: string | null;
    }>;
  }

  return (await sql`
    SELECT id::text, typeform_form_id, section::text, question_key, question_text, answer_text, analyst_evaluation::text, analyst_observations
    FROM partner_typeform_assessment_pt_v2_responses
    WHERE typeform_response_token = ${responseToken}
    ORDER BY question_order ASC, created_at ASC
  `) as Array<{
    id: string;
    typeform_form_id: string | null;
    section: string | null;
    question_key: string | null;
    question_text: string;
    answer_text: string | null;
    analyst_evaluation: string | null;
    analyst_observations: string | null;
  }>;
}

async function getPartnerFormQuestionRowsByCompany(tableName: string, companyName: string) {
  if (tableName === "partner_typeform_assessment_ptbr_responses") {
    return (await sql`
      SELECT id::text, typeform_form_id, section::text, question_key, question_text, answer_text, analyst_evaluation::text, analyst_observations
      FROM partner_typeform_assessment_ptbr_responses
      WHERE lower(company_name) = lower(${companyName})
      ORDER BY response_submitted_at DESC NULLS LAST, question_order ASC, created_at ASC
    `) as Array<{
      id: string;
      typeform_form_id: string | null;
      section: string | null;
      question_key: string | null;
      question_text: string;
      answer_text: string | null;
      analyst_evaluation: string | null;
      analyst_observations: string | null;
    }>;
  }

  if (tableName === "partner_typeform_assessment_en_responses") {
    return (await sql`
      SELECT id::text, typeform_form_id, section::text, question_key, question_text, answer_text, analyst_evaluation::text, analyst_observations
      FROM partner_typeform_assessment_en_responses
      WHERE lower(company_name) = lower(${companyName})
      ORDER BY response_submitted_at DESC NULLS LAST, question_order ASC, created_at ASC
    `) as Array<{
      id: string;
      typeform_form_id: string | null;
      section: string | null;
      question_key: string | null;
      question_text: string;
      answer_text: string | null;
      analyst_evaluation: string | null;
      analyst_observations: string | null;
    }>;
  }

  if (tableName === "partner_typeform_assessment_en_v2_responses") {
    return (await sql`
      SELECT id::text, typeform_form_id, section::text, question_key, question_text, answer_text, analyst_evaluation::text, analyst_observations
      FROM partner_typeform_assessment_en_v2_responses
      WHERE lower(company_name) = lower(${companyName})
      ORDER BY response_submitted_at DESC NULLS LAST, question_order ASC, created_at ASC
    `) as Array<{
      id: string;
      typeform_form_id: string | null;
      section: string | null;
      question_key: string | null;
      question_text: string;
      answer_text: string | null;
      analyst_evaluation: string | null;
      analyst_observations: string | null;
    }>;
  }

  return (await sql`
    SELECT id::text, typeform_form_id, section::text, question_key, question_text, answer_text, analyst_evaluation::text, analyst_observations
    FROM partner_typeform_assessment_pt_v2_responses
    WHERE lower(company_name) = lower(${companyName})
    ORDER BY response_submitted_at DESC NULLS LAST, question_order ASC, created_at ASC
  `) as Array<{
    id: string;
    typeform_form_id: string | null;
    section: string | null;
    question_key: string | null;
    question_text: string;
    answer_text: string | null;
    analyst_evaluation: string | null;
    analyst_observations: string | null;
  }>;
}

export async function getVendorsList() {
  const rows = (await sql`
    SELECT
      e.slug,
      e.name,
      e.jira_issue_key,
      e.domain,
      e.segment,
      e.status,
      e.risk_level,
      e.company_group,
      e.last_review_at,
      COALESCE(u.full_name, 'Unassigned') AS owner,
      latest_assessment.id AS latest_assessment_id,
      latest_assessment.status AS latest_assessment_status,
      latest_assessment.response_count AS latest_response_count,
      latest_decision.security_level AS latest_security_level,
      latest_decision.privacy_level AS latest_privacy_level,
      COUNT(a.id) FILTER (
        WHERE a.status IN ('PENDING', 'SENT', 'RESPONDED', 'IN_REVIEW')
      )::int AS open_assessments
    FROM entities e
    LEFT JOIN users u ON u.id = e.owner_user_id
    LEFT JOIN assessments a ON a.entity_id = e.id
    LEFT JOIN LATERAL (
      SELECT
        aa.id,
        aa.status,
        (
          SELECT COUNT(*)
          FROM assessment_question_responses aqr
          WHERE aqr.assessment_id = aa.id
        )::int AS response_count
      FROM assessments aa
      WHERE aa.entity_id = e.id
      ORDER BY aa.created_at DESC
      LIMIT 1
    ) latest_assessment ON true
    LEFT JOIN LATERAL (
      SELECT security_level, privacy_level
      FROM assessment_decisions ad
      WHERE ad.assessment_id = latest_assessment.id
      LIMIT 1
    ) latest_decision ON true
    WHERE e.kind = 'VENDOR'
    GROUP BY
      e.id,
      u.full_name,
      latest_assessment.id,
      latest_assessment.status,
      latest_assessment.response_count,
      latest_decision.security_level,
      latest_decision.privacy_level
    ORDER BY e.created_at DESC, e.name ASC
  `) as Array<{
    slug: string;
    name: string;
    jira_issue_key: string | null;
    domain: string | null;
    segment: string | null;
    status: string;
    risk_level: string | null;
    company_group: string;
    last_review_at: string | null;
    owner: string;
    latest_assessment_id: string | null;
    latest_assessment_status: string | null;
    latest_response_count: number;
    latest_security_level: string | null;
    latest_privacy_level: string | null;
    open_assessments: number;
  }>;

  return rows.map((row) => {
    const finalRisk = maxRisk(row.latest_security_level, row.latest_privacy_level, row.risk_level);
    const riskUi = riskClasses(finalRisk);

    return {
      id: row.slug,
      jiraTicket: row.jira_issue_key,
      companyGroup: toCompanyGroup(row.company_group),
      company: row.name,
      domain: row.domain ?? "-",
      segment: row.segment ?? "-",
      status: mapStatus(row.status),
      intakeStatus: mapVendorIntakeStatus(row.latest_assessment_status, row.latest_privacy_level, row.latest_security_level),
      principalQuestionnaireStatus: mapMainQuestionnaireStatus(
        row.latest_response_count,
        row.latest_privacy_level,
        row.latest_security_level,
      ),
      technicalReviewStatus: mapTechnicalReviewStatus(row.latest_assessment_status),
      risk: finalRisk,
      privacyRisk: mapDecisionRisk(row.latest_privacy_level),
      securityRisk: mapDecisionRisk(row.latest_security_level),
      ...riskUi,
      openAssessments: row.open_assessments,
      owner: row.owner,
      lastReview: formatDateNumeric(row.last_review_at),
      activeAssessmentId: row.latest_assessment_id,
      activeAssessmentStatus: mapStatusNullable(row.latest_assessment_status),
    };
  });
}

export async function getPartnersList() {
  const rows = (await sql`
    SELECT
      e.slug,
      e.name,
      e.jira_issue_key,
      e.domain,
      e.segment,
      e.status,
      e.risk_level,
      e.company_group,
      COALESCE(
        latest_partner_review.reviewed_at,
        latest_decision.updated_at,
        e.last_review_at
      ) AS last_review_at,
      COALESCE(u.full_name, 'Unassigned') AS owner,
      latest_assessment.id AS latest_assessment_id,
      latest_assessment.status AS latest_assessment_status,
      latest_decision.security_level AS latest_security_level,
      latest_decision.privacy_level AS latest_privacy_level,
      latest_decision.compliance_level AS latest_compliance_level,
      COUNT(a.id) FILTER (
        WHERE a.status IN ('PENDING', 'SENT', 'RESPONDED', 'IN_REVIEW')
      )::int AS open_assessments
    FROM entities e
    LEFT JOIN users u ON u.id = e.owner_user_id
    LEFT JOIN assessments a ON a.entity_id = e.id
    LEFT JOIN LATERAL (
      SELECT aa.id, aa.status, aa.typeform_response_token, aa.typeform_form_id
      FROM assessments aa
      WHERE aa.entity_id = e.id
      ORDER BY aa.created_at DESC
      LIMIT 1
    ) latest_assessment ON true
    LEFT JOIN LATERAL (
      SELECT security_level, privacy_level, compliance_level, updated_at
      FROM assessment_decisions ad
      WHERE ad.assessment_id = latest_assessment.id
      LIMIT 1
    ) latest_decision ON true
    LEFT JOIN LATERAL (
      SELECT MAX(reviewed_at) AS reviewed_at
      FROM (
        SELECT analyzed_at AS reviewed_at
        FROM partner_typeform_assessment_ptbr_responses
        WHERE
          (latest_assessment.id IS NOT NULL AND assessment_id = latest_assessment.id)
          OR (
            latest_assessment.typeform_response_token IS NOT NULL
            AND typeform_response_token = latest_assessment.typeform_response_token
          )
          OR (
            lower(company_name) = lower(e.name)
            AND (
              latest_assessment.typeform_form_id IS NULL
              OR typeform_form_id = latest_assessment.typeform_form_id
            )
          )

        UNION ALL

        SELECT analyzed_at AS reviewed_at
        FROM partner_typeform_assessment_en_responses
        WHERE
          (latest_assessment.id IS NOT NULL AND assessment_id = latest_assessment.id)
          OR (
            latest_assessment.typeform_response_token IS NOT NULL
            AND typeform_response_token = latest_assessment.typeform_response_token
          )
          OR (
            lower(company_name) = lower(e.name)
            AND (
              latest_assessment.typeform_form_id IS NULL
              OR typeform_form_id = latest_assessment.typeform_form_id
            )
          )

        UNION ALL

        SELECT analyzed_at AS reviewed_at
        FROM partner_typeform_assessment_pt_v2_responses
        WHERE
          (latest_assessment.id IS NOT NULL AND assessment_id = latest_assessment.id)
          OR (
            latest_assessment.typeform_response_token IS NOT NULL
            AND typeform_response_token = latest_assessment.typeform_response_token
          )
          OR (
            lower(company_name) = lower(e.name)
            AND (
              latest_assessment.typeform_form_id IS NULL
              OR typeform_form_id = latest_assessment.typeform_form_id
            )
          )

        UNION ALL

        SELECT analyzed_at AS reviewed_at
        FROM partner_typeform_assessment_en_v2_responses
        WHERE
          (latest_assessment.id IS NOT NULL AND assessment_id = latest_assessment.id)
          OR (
            latest_assessment.typeform_response_token IS NOT NULL
            AND typeform_response_token = latest_assessment.typeform_response_token
          )
          OR (
            lower(company_name) = lower(e.name)
            AND (
              latest_assessment.typeform_form_id IS NULL
              OR typeform_form_id = latest_assessment.typeform_form_id
            )
          )
      ) partner_reviews
    ) latest_partner_review ON true
    WHERE e.kind = 'PARTNER'
    GROUP BY
      e.id,
      u.full_name,
      latest_assessment.id,
      latest_assessment.status,
      latest_assessment.typeform_response_token,
      latest_assessment.typeform_form_id,
      latest_decision.security_level,
      latest_decision.privacy_level,
      latest_decision.compliance_level,
      latest_decision.updated_at,
      latest_partner_review.reviewed_at
    ORDER BY e.created_at DESC, e.name ASC
  `) as Array<{
    slug: string;
    name: string;
    jira_issue_key: string | null;
    domain: string | null;
    segment: string | null;
    status: string;
    risk_level: string | null;
    company_group: string;
    last_review_at: string | null;
    owner: string;
    latest_assessment_id: string | null;
    latest_assessment_status: string | null;
    latest_security_level: string | null;
    latest_privacy_level: string | null;
    latest_compliance_level: string | null;
    open_assessments: number;
  }>;

  return rows.map((row) => {
    const finalRisk = resolvePartnerFinalRisk(
      row.latest_assessment_status,
      row.latest_security_level,
      row.latest_privacy_level,
      row.latest_compliance_level,
      row.risk_level,
    );
    const riskUi = finalRisk ? riskClasses(finalRisk) : null;

    return {
      id: row.slug,
      jiraTicket: row.jira_issue_key,
      companyGroup: toCompanyGroup(row.company_group),
      company: row.name,
      domain: row.domain ?? "-",
      segment: row.segment ?? "-",
      status: mapStatus(row.status),
      assessmentStatus: mapPartnerAssessmentStatus(row.latest_assessment_status),
      technicalReviewStatus: mapTechnicalReviewStatus(row.latest_assessment_status),
      risk: finalRisk ?? "Pending",
      privacyRisk: mapDecisionRisk(row.latest_privacy_level),
      securityRisk: mapDecisionRisk(row.latest_security_level),
      complianceRisk: mapDecisionRisk(row.latest_compliance_level),
      riskClass: riskUi?.riskClass ?? "text-[var(--color-neutral-600)]",
      riskDot: riskUi?.riskDot ?? "bg-[var(--color-neutral-400)]",
      openAssessments: row.open_assessments,
      owner: row.owner,
      lastReview: formatDateNumeric(row.last_review_at),
      activeAssessmentId: row.latest_assessment_id,
      activeAssessmentStatus: mapStatusNullable(row.latest_assessment_status),
    };
  });
}

export async function getAssessmentsList() {
  const rows = (await sql`
    SELECT
      a.id,
      e.slug,
      e.name,
      e.domain,
      e.kind,
      e.company_group,
      a.status,
      a.risk_level,
      a.progress_percent,
      COALESCE(u.full_name, 'Unassigned') AS analyst,
      a.sent_at
    FROM assessments a
    INNER JOIN entities e ON e.id = a.entity_id
    LEFT JOIN users u ON u.id = a.analyst_user_id
    ORDER BY a.created_at DESC
  `) as Array<{
    id: string;
    slug: string;
    name: string;
    domain: string | null;
    kind: string;
    company_group: string;
    status: string;
    risk_level: string | null;
    progress_percent: number;
    analyst: string;
    sent_at: string | null;
  }>;

  return rows.map((row) => {
    const risk = row.risk_level ? mapRisk(row.risk_level) : "Low";
    const riskUi = riskClasses(risk);

    return {
      id: row.id,
      slug: row.slug,
      companyGroup: toCompanyGroup(row.company_group),
      company: row.name,
      domain: row.domain ?? "-",
      type: toUiKind(row.kind),
      status: mapStatus(row.status),
      risk,
      ...riskUi,
      progress: row.progress_percent,
      progressClass: row.progress_percent >= 100 ? "bg-emerald-500" : "bg-[var(--color-primary)]",
      analyst: row.analyst,
      sentDate: formatDate(row.sent_at),
    };
  });
}

export async function markAssessmentRespondedManually(assessmentId: string) {
  await sql`
    UPDATE assessments
    SET
      status = 'RESPONDED',
      responded_at = COALESCE(responded_at, now()),
      updated_at = now()
    WHERE id = ${assessmentId}::uuid
      AND status IN ('PENDING', 'SENT')
  `;
}

export async function markAssessmentInReviewManually(assessmentId: string) {
  await sql`
    UPDATE assessments
    SET
      status = 'IN_REVIEW',
      updated_at = now()
    WHERE id = ${assessmentId}::uuid
      AND status = 'RESPONDED'
  `;
}

export async function markAssessmentCompletedManually(assessmentId: string) {
  await sql`
    UPDATE assessments
    SET
      status = 'COMPLETED',
      completed_at = COALESCE(completed_at, now()),
      progress_percent = 100,
      updated_at = now()
    WHERE id = ${assessmentId}::uuid
      AND status = 'IN_REVIEW'
  `;
}

export async function getEntityDetailBySlug(kind: "vendor" | "partner", slug: string): Promise<EntityDetailData | null> {
  const entityRows = (await sql`
    SELECT
      e.id,
      e.slug,
      e.name,
      e.jira_issue_key,
      e.subtitle,
      e.status,
      e.status_label,
      e.risk_score,
      e.category,
      e.hq_location,
      e.website,
      e.contact_email,
      e.description,
      fp.full_name AS focal_name,
      fp.role_title AS focal_role,
      fp.area AS focal_area,
      fp.email AS focal_email,
      fp.phone AS focal_phone
    FROM entities e
    LEFT JOIN internal_focal_points fp ON fp.entity_id = e.id
    WHERE e.slug = ${slug} AND e.kind = ${kind.toUpperCase()}
    LIMIT 1
  `) as Array<{
    id: string;
    slug: string;
    name: string;
    jira_issue_key: string | null;
    subtitle: string | null;
    status: string;
    status_label: string | null;
    risk_score: number | null;
    category: string | null;
    hq_location: string | null;
    website: string | null;
    contact_email: string | null;
    description: string | null;
    focal_name: string | null;
    focal_role: string | null;
    focal_area: string | null;
    focal_email: string | null;
    focal_phone: string | null;
  }>;

  const entity = entityRows[0];
  if (!entity) return null;

  const assessments = (await sql`
    SELECT id, status, risk_level, created_at, typeform_response_token, typeform_form_id, typeform_submitted_at
    FROM assessments
    WHERE entity_id = ${entity.id}
    ORDER BY created_at DESC
    LIMIT 1
  `) as Array<{
    id: string;
    status: string;
    risk_level: string | null;
    created_at: string;
    typeform_response_token: string | null;
    typeform_form_id: string | null;
    typeform_submitted_at: string | null;
  }>;

  const latestAssessment = assessments[0];
  const initialTypeformFormRows =
    latestAssessment?.typeform_form_id
      ? ((await sql`
          SELECT name
          FROM typeform_forms
          WHERE form_id = ${latestAssessment.typeform_form_id}
          LIMIT 1
        `) as Array<{ name: string }>)
      : [];
  let resolvedTypeformFormId = latestAssessment?.typeform_form_id ?? null;
  let resolvedTypeformFormName = initialTypeformFormRows[0]?.name ?? null;

  const internalQuestionnaire =
    kind === "vendor"
      ? await readInternalQuestionnaireFromGoogleSheets({
          jiraTicket: entity.jira_issue_key,
          entitySlug: entity.slug,
          entityName: entity.name,
          entityKind: "VENDOR",
        })
      : null;

  let finalQuestions: EntityDetailData["questions"] = [];
  let partnerFormTable =
    kind === "partner" ? resolvePartnerFormResponseTable(resolvedTypeformFormName ?? resolvedTypeformFormId ?? null) : null;
  let partnerOverviewFromCommon: ReturnType<typeof derivePartnerOverviewFromCommonQuestions> | null = null;

  if (kind === "partner" && latestAssessment) {
    let partnerQuestionRows:
      | Awaited<ReturnType<typeof getPartnerFormQuestionRows>>
      | null = null;

    if (partnerFormTable) {
      partnerQuestionRows = await getPartnerFormQuestionRows(partnerFormTable, latestAssessment.id);
      if (partnerQuestionRows.length === 0 && latestAssessment.typeform_response_token) {
        partnerQuestionRows = await getPartnerFormQuestionRowsByToken(partnerFormTable, latestAssessment.typeform_response_token);
      }
      if (partnerQuestionRows.length === 0) {
        partnerQuestionRows = await getPartnerFormQuestionRowsByCompany(partnerFormTable, entity.name);
      }
    }

    if (!partnerQuestionRows || partnerQuestionRows.length === 0) {
      const existingSource = await getPartnerExistingResponseSource({
        assessmentId: latestAssessment.id,
        responseToken: latestAssessment.typeform_response_token,
        companyName: entity.name,
      });

      if (existingSource) {
        partnerFormTable = existingSource.tableName;
        partnerQuestionRows = existingSource.rows;
        resolvedTypeformFormId = existingSource.formId ?? resolvedTypeformFormId;
        resolvedTypeformFormName = existingSource.formName ?? resolvedTypeformFormName;
      }
    }

    const sectionOverrides = await getTypeformQuestionSectionOverrides(resolvedTypeformFormId);

    const commonQuestionAnswers = (partnerQuestionRows ?? [])
      .map((q) => {
        const resolvedSection =
          sectionOverrides.get(`key:${q.question_key ?? ""}`) ??
          sectionOverrides.get(`text:${q.question_text.trim().toLowerCase()}`) ??
          q.section;

        return {
          question: q.question_text,
          answer: q.answer_text ?? "",
          questionKey: q.question_key,
          section: mapPartnerQuestionSection(resolvedSection),
        };
      })
      .filter((item) => item.section === "Common");

    partnerOverviewFromCommon = derivePartnerOverviewFromCommonQuestions(commonQuestionAnswers);

    finalQuestions = (partnerQuestionRows ?? []).map((q) => ({
      responseId: q.id,
      domain:
        sectionOverrides.get(`key:${q.question_key ?? ""}`) ??
        sectionOverrides.get(`text:${q.question_text.trim().toLowerCase()}`) ??
        q.section ??
        "UNCLASSIFIED",
      section: mapPartnerQuestionSection(
        sectionOverrides.get(`key:${q.question_key ?? ""}`) ??
          sectionOverrides.get(`text:${q.question_text.trim().toLowerCase()}`) ??
          q.section,
      ),
      status: q.analyst_evaluation && q.analyst_evaluation !== "NOT_EVALUATED" ? "compliant" : "needs_review",
      analystEvaluation:
        q.analyst_evaluation === "NA" ||
        q.analyst_evaluation === "DOES_NOT_MEET" ||
        q.analyst_evaluation === "PARTIALLY" ||
        q.analyst_evaluation === "FULLY" ||
        q.analyst_evaluation === "NOT_EVALUATED"
          ? q.analyst_evaluation
          : "NOT_EVALUATED",
      analystObservations: q.analyst_observations ?? "",
      question: q.question_text,
      answer: q.answer_text ?? "No answer provided.",
      source: "database" as const,
    }));
  } else {
    const questions = latestAssessment
      ? ((await sql`
          SELECT domain, question_text, answer_text, review_status
          FROM assessment_question_responses
          WHERE assessment_id = ${latestAssessment.id}
          ORDER BY created_at ASC
        `) as Array<{
          domain: string;
          question_text: string;
          answer_text: string | null;
          review_status: string;
        }>)
      : [];

    finalQuestions = questions.map((q) => ({
      domain: q.domain,
      status: q.review_status.toLowerCase() === "needs_review" ? ("needs_review" as const) : ("compliant" as const),
      question: q.question_text,
      answer: q.answer_text ?? "No answer provided.",
      source: "database" as const,
    }));
  }

  const breakdownRows = (await sql`
    SELECT dimension, score, level
    FROM entity_risk_breakdowns
    WHERE entity_id = ${entity.id}
    ORDER BY dimension ASC
  `) as Array<{ dimension: string; score: number; level: string }>;

  const timelineRows = (await sql`
    SELECT title, note, event_at, is_current
    FROM entity_timeline_events
    WHERE entity_id = ${entity.id}
    ORDER BY sort_order ASC
  `) as Array<{ title: string; note: string | null; event_at: string | null; is_current: boolean }>;

  let decisionRows: Array<{
    security_score: number | string | null;
    security_level: string | null;
    security_note: string | null;
    privacy_score: number | string | null;
    privacy_level: string | null;
    privacy_note: string | null;
    compliance_score: number | string | null;
    compliance_level: string | null;
    compliance_note: string | null;
    combined_score: number | string | null;
    classification: string | null;
  }> = [];

  if (latestAssessment) {
    try {
      decisionRows = (await sql`
        SELECT
          security_score,
          security_level,
          security_note,
          privacy_score,
          privacy_level,
          privacy_note,
          compliance_score,
          compliance_level,
          compliance_note,
          combined_score,
          classification
        FROM assessment_decisions
        WHERE assessment_id = ${latestAssessment.id}
        LIMIT 1
      `) as typeof decisionRows;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "42703") {
        decisionRows = (await sql`
          SELECT
            NULL::numeric AS security_score,
            security_level,
            security_note,
            NULL::numeric AS privacy_score,
            privacy_level,
            privacy_note,
            NULL::numeric AS compliance_score,
            compliance_level,
            compliance_note,
            combined_score,
            classification
          FROM assessment_decisions
          WHERE assessment_id = ${latestAssessment.id}
          LIMIT 1
        `) as typeof decisionRows;
      } else {
        throw error;
      }
    }
  }

  const decision = decisionRows[0];
  const securityScore = normalizeDecimal(decision?.security_score);
  const privacyScore = normalizeDecimal(decision?.privacy_score);
  const complianceScore = normalizeDecimal(decision?.compliance_score);
  const combinedScore = normalizeDecimal(decision?.combined_score);

  const statusMode: EntityDetailData["statusMode"] =
    mapStatus(entity.status) === "completed"
      ? "completed"
      : mapStatus(entity.status) === "pending"
        ? "pending"
        : "in_review";

  const riskLevelToOverview = (level: string | null): RiskLevel => {
    if (!level) return "Low";
    const ui = mapRisk(level);
    if (ui === "Critical") return "High";
    return ui as RiskLevel;
  };

  const riskLevelToDecision = (level: string | null, score: number | null): RiskLevel => {
    if (score === null || !level) return "Pending";
    return riskLevelToOverview(level);
  };

  const headerRiskScore =
    kind === "partner"
      ? combinedScore !== null
        ? Math.round(combinedScore * 10)
        : (entity.risk_score ?? 0)
      : (entity.risk_score ?? 0);

  const riskBreakdown = breakdownRows.map((item) => ({
    label: toTitleCase(item.dimension) as "Security" | "Privacy" | "Financial" | "Operational",
    score: item.score,
    level: riskLevelToOverview(item.level),
  }));

  return {
    id: entity.slug,
    name: entity.name,
    jiraTicket: entity.jira_issue_key,
    externalQuestionnaire: {
      assessmentId: latestAssessment?.id ?? null,
      formId: resolvedTypeformFormId,
      formName: resolvedTypeformFormName,
      responseTable: partnerFormTable,
      source: resolvedTypeformFormId ? "typeform" : "database",
      submittedAt: latestAssessment?.typeform_submitted_at
        ? formatDate(latestAssessment.typeform_submitted_at)
        : undefined,
    },
    subtitle: entity.subtitle ?? (kind === "vendor" ? "Enterprise Vendor" : "Strategic Partner"),
    statusLabel: entity.status_label ?? "In Progress",
    statusMode,
    riskScore: headerRiskScore,
    internalQuestionnaire,
    questions: finalQuestions,
    overview: {
      category: kind === "partner" ? (partnerOverviewFromCommon?.category ?? "-") : (entity.category ?? "-"),
      hqLocation: kind === "partner" ? (partnerOverviewFromCommon?.hqLocation ?? "-") : (entity.hq_location ?? "-"),
      website: kind === "partner" ? (partnerOverviewFromCommon?.website ?? "-") : (entity.website ?? "-"),
      contact: kind === "partner" ? (partnerOverviewFromCommon?.contact ?? "-") : (entity.contact_email ?? "-"),
      contactName: kind === "partner" ? (partnerOverviewFromCommon?.contactName ?? "-") : "-",
      contactPhone: kind === "partner" ? (partnerOverviewFromCommon?.contactPhone ?? "-") : "-",
      contactEmail: kind === "partner" ? (partnerOverviewFromCommon?.contactEmail ?? "-") : "-",
      internalFocalPoint: {
        name: entity.focal_name ?? "-",
        role: entity.focal_role ?? "-",
        area: entity.focal_area ?? "-",
        email: entity.focal_email ?? "-",
        phone: entity.focal_phone ?? "-",
      },
      description:
        kind === "partner"
          ? (partnerOverviewFromCommon?.description ?? "No description available.")
          : (entity.description ?? "No description available."),
      riskBreakdown:
        riskBreakdown.length > 0
          ? riskBreakdown
          : [
              { label: "Security", score: 0, level: "Low" },
              { label: "Privacy", score: 0, level: "Low" },
              { label: "Financial", score: 0, level: "Low" },
              { label: "Operational", score: 0, level: "Low" },
            ],
      timeline:
        timelineRows.length > 0
          ? timelineRows.map((t) => ({
              title: t.title,
              date: t.event_at ? formatDate(t.event_at) : "-",
              note: t.note ?? "",
              current: t.is_current,
            }))
          : [
              {
                title: "No timeline events",
                date: "-",
                note: "Add timeline events for this entity.",
                current: true,
              },
            ],
    },
    decision: {
      security: {
        level: riskLevelToDecision(decision?.security_level ?? null, securityScore),
        note: decision?.security_note ?? "No security decision note.",
        score: securityScore?.toFixed(1) ?? "-",
      },
      privacy: {
        level: riskLevelToDecision(decision?.privacy_level ?? null, privacyScore),
        note: decision?.privacy_note ?? "No privacy decision note.",
        score: privacyScore?.toFixed(1) ?? "-",
      },
      compliance: {
        level: riskLevelToDecision(decision?.compliance_level ?? null, complianceScore),
        note: decision?.compliance_note ?? "No compliance decision note.",
        score: complianceScore?.toFixed(1) ?? "-",
      },
      combinedScore: combinedScore?.toFixed(1) ?? "0.0",
      classification: decision?.classification ?? "Not classified",
    },
  };
}

export function normalizeTab(tab?: string): DetailTabKey {
  const validTabs: DetailTabKey[] = [
    "overview",
    "internal_questionnaire",
    "external_questionnaire",
    "evidence",
    "security_review",
    "privacy_review",
    "decision",
  ];

  return validTabs.includes(tab as DetailTabKey) ? (tab as DetailTabKey) : "overview";
}

export function normalizePartnerTab(tab?: string): DetailTabKey {
  const validTabs: DetailTabKey[] = ["overview", "external_questionnaire", "decision"];

  return validTabs.includes(tab as DetailTabKey) ? (tab as DetailTabKey) : "overview";
}
