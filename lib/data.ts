import { sql } from "@/lib/db";
import type { DetailTabKey, EntityDetailData, RiskLevel } from "@/lib/entity-detail-data";
import { readAssessmentQuestionsFromGoogleSheets, readInternalQuestionnaireFromGoogleSheets } from "@/lib/google-sheets";
import { syncPartnerExternalQuestionnaire } from "@/lib/typeform-sync";

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
      lastReview: formatDate(row.last_review_at),
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
      e.last_review_at,
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
      SELECT aa.id, aa.status
      FROM assessments aa
      WHERE aa.entity_id = e.id
      ORDER BY aa.created_at DESC
      LIMIT 1
    ) latest_assessment ON true
    LEFT JOIN LATERAL (
      SELECT security_level, privacy_level, compliance_level
      FROM assessment_decisions ad
      WHERE ad.assessment_id = latest_assessment.id
      LIMIT 1
    ) latest_decision ON true
    WHERE e.kind = 'PARTNER'
    GROUP BY
      e.id,
      u.full_name,
      latest_assessment.id,
      latest_assessment.status,
      latest_decision.security_level,
      latest_decision.privacy_level,
      latest_decision.compliance_level
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
    const finalRisk = maxRisk(row.latest_security_level, row.latest_privacy_level, row.latest_compliance_level, row.risk_level);
    const riskUi = riskClasses(finalRisk);

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
      risk: finalRisk,
      privacyRisk: mapDecisionRisk(row.latest_privacy_level),
      securityRisk: mapDecisionRisk(row.latest_security_level),
      complianceRisk: mapDecisionRisk(row.latest_compliance_level),
      ...riskUi,
      openAssessments: row.open_assessments,
      owner: row.owner,
      lastReview: formatDate(row.last_review_at),
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

  if (kind === "partner") {
    await syncPartnerExternalQuestionnaire(entity.id, entity.name);
  }

  const assessments = (await sql`
    SELECT id, status, risk_level, created_at
    FROM assessments
    WHERE entity_id = ${entity.id}
    ORDER BY created_at DESC
    LIMIT 1
  `) as Array<{
    id: string;
    status: string;
    risk_level: string | null;
    created_at: string;
  }>;

  const latestAssessment = assessments[0];

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

  const sheetQuestions = await readAssessmentQuestionsFromGoogleSheets({
    assessmentId: latestAssessment?.id,
    entitySlug: entity.slug,
    entityName: entity.name,
    entityKind: kind.toUpperCase() === "PARTNER" ? "PARTNER" : "VENDOR",
  });

  const internalQuestionnaire =
    kind === "vendor"
      ? await readInternalQuestionnaireFromGoogleSheets({
          jiraTicket: entity.jira_issue_key,
          entitySlug: entity.slug,
          entityName: entity.name,
          entityKind: "VENDOR",
        })
      : null;

  const finalQuestions =
    sheetQuestions.length > 0
      ? sheetQuestions
      : questions.map((q) => ({
          domain: q.domain,
          status: q.review_status.toLowerCase() === "needs_review" ? ("needs_review" as const) : ("compliant" as const),
          question: q.question_text,
          answer: q.answer_text ?? "No answer provided.",
          source: "database" as const,
        }));

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

  const decisionRows = latestAssessment
    ? ((await sql`
        SELECT
          security_level,
          security_note,
          privacy_level,
          privacy_note,
          compliance_level,
          compliance_note,
          combined_score,
          classification
        FROM assessment_decisions
        WHERE assessment_id = ${latestAssessment.id}
        LIMIT 1
      `) as Array<{
        security_level: string | null;
        security_note: string | null;
        privacy_level: string | null;
        privacy_note: string | null;
        compliance_level: string | null;
        compliance_note: string | null;
        combined_score: number | null;
        classification: string | null;
      }>)
    : [];

  const decision = decisionRows[0];

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

  const riskBreakdown = breakdownRows.map((item) => ({
    label: toTitleCase(item.dimension) as "Security" | "Privacy" | "Financial" | "Operational",
    score: item.score,
    level: riskLevelToOverview(item.level),
  }));

  return {
    id: entity.slug,
    name: entity.name,
    jiraTicket: entity.jira_issue_key,
    subtitle: entity.subtitle ?? (kind === "vendor" ? "Enterprise Vendor" : "Strategic Partner"),
    statusLabel: entity.status_label ?? "In Progress",
    statusMode,
    riskScore: entity.risk_score ?? 0,
    internalQuestionnaire,
    questions: finalQuestions,
    overview: {
      category: entity.category ?? "-",
      hqLocation: entity.hq_location ?? "-",
      website: entity.website ?? "-",
      contact: entity.contact_email ?? "-",
      internalFocalPoint: {
        name: entity.focal_name ?? "-",
        role: entity.focal_role ?? "-",
        area: entity.focal_area ?? "-",
        email: entity.focal_email ?? "-",
        phone: entity.focal_phone ?? "-",
      },
      description: entity.description ?? "No description available.",
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
        level: riskLevelToOverview(decision?.security_level ?? "LOW"),
        note: decision?.security_note ?? "No security decision note.",
      },
      privacy: {
        level: riskLevelToOverview(decision?.privacy_level ?? "LOW"),
        note: decision?.privacy_note ?? "No privacy decision note.",
      },
      compliance: {
        level: riskLevelToOverview(decision?.compliance_level ?? "LOW"),
        note: decision?.compliance_note ?? "No compliance decision note.",
      },
      combinedScore: decision?.combined_score?.toString() ?? "0.0",
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
