import { sql } from "@/lib/db";
import { getPlatformSettings, normalizeRiskScoringSettings, type RiskScoringProfile } from "@/lib/platform-settings";

type PartnerResponseTableName =
  | "partner_typeform_assessment_en_responses"
  | "partner_typeform_assessment_ptbr_responses"
  | "partner_typeform_assessment_en_v2_responses"
  | "partner_typeform_assessment_pt_v2_responses";

type ScoredSection = "COMPLIANCE" | "PRIVACY" | "SECURITY";
type AnalystEvaluation = "NOT_EVALUATED" | "NA" | "DOES_NOT_MEET" | "PARTIALLY" | "FULLY";
type DecisionLevel = "LOW" | "MEDIUM" | "HIGH";

type ResponseRow = {
  assessment_id: string | null;
  typeform_form_id: string | null;
  typeform_response_token: string | null;
  company_name: string | null;
  question_key: string | null;
  question_text: string;
  section: string | null;
  analyst_evaluation: string | null;
};

type AssessmentContext = {
  assessment_id: string;
  typeform_form_id: string | null;
  typeform_response_token: string | null;
  company_name: string | null;
};

type MappingRow = {
  question_key: string;
  question_text: string;
  section: string;
  weight: number;
};

const scoredSections: ScoredSection[] = ["COMPLIANCE", "PRIVACY", "SECURITY"];
const partnerResponseTables: PartnerResponseTableName[] = [
  "partner_typeform_assessment_en_responses",
  "partner_typeform_assessment_ptbr_responses",
  "partner_typeform_assessment_en_v2_responses",
  "partner_typeform_assessment_pt_v2_responses",
];

function normalizeLookup(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function toDecisionLevel(
  score: number | null,
  settings: RiskScoringProfile,
): DecisionLevel | null {
  if (score === null || Number.isNaN(score)) return null;
  if (score <= settings.low_max) return "LOW";
  if (score <= settings.medium_max) return "MEDIUM";
  return "HIGH";
}

function getEvaluationScore(
  evaluation: AnalystEvaluation,
  settings: RiskScoringProfile,
) {
  if (evaluation === "FULLY") return settings.fully_score;
  if (evaluation === "PARTIALLY") return settings.partially_score;
  if (evaluation === "DOES_NOT_MEET") return settings.does_not_meet_score;
  return null;
}

function decisionLevelSeverity(level: DecisionLevel | null) {
  if (level === "HIGH") return 3;
  if (level === "MEDIUM") return 2;
  if (level === "LOW") return 1;
  return 0;
}

function getModelOneClassification(input: {
  combinedScore: number | null;
  settings: RiskScoringProfile;
  requiredSectionLevels: Array<DecisionLevel | null>;
}) {
  if (input.requiredSectionLevels.some((level) => !level)) {
    return "Pending Review";
  }

  const combinedLevel = toDecisionLevel(input.combinedScore, input.settings);
  const worstSectionLevel = input.requiredSectionLevels.reduce<DecisionLevel | null>((worst, current) => {
    return decisionLevelSeverity(current) > decisionLevelSeverity(worst) ? current : worst;
  }, null);

  const finalLevel =
    decisionLevelSeverity(worstSectionLevel) > decisionLevelSeverity(combinedLevel) ? worstSectionLevel : combinedLevel;

  if (finalLevel === "HIGH") return "High Risk";
  if (finalLevel === "MEDIUM") return "Medium Risk";
  if (finalLevel === "LOW") return "Low Risk";
  return "Pending Review";
}

function getSectionNote(section: ScoredSection, answeredCount: number, totalWeight: number, score: number | null) {
  if (score === null || answeredCount === 0 || totalWeight <= 0) {
    return `No scored ${section.toLowerCase()} answers yet.`;
  }

  return `Calculated from ${answeredCount} evaluated question(s), with total weight ${totalWeight.toFixed(1)}.`;
}

async function getAssessmentResponseRows(tableName: PartnerResponseTableName, assessmentId: string) {
  if (tableName === "partner_typeform_assessment_ptbr_responses") {
    return (await sql`
      SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name, question_key, question_text, section::text, analyst_evaluation::text
      FROM partner_typeform_assessment_ptbr_responses
      WHERE assessment_id = ${assessmentId}::uuid
    `) as ResponseRow[];
  }

  if (tableName === "partner_typeform_assessment_en_responses") {
    return (await sql`
      SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name, question_key, question_text, section::text, analyst_evaluation::text
      FROM partner_typeform_assessment_en_responses
      WHERE assessment_id = ${assessmentId}::uuid
    `) as ResponseRow[];
  }

  if (tableName === "partner_typeform_assessment_en_v2_responses") {
    return (await sql`
      SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name, question_key, question_text, section::text, analyst_evaluation::text
      FROM partner_typeform_assessment_en_v2_responses
      WHERE assessment_id = ${assessmentId}::uuid
    `) as ResponseRow[];
  }

  return (await sql`
    SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name, question_key, question_text, section::text, analyst_evaluation::text
    FROM partner_typeform_assessment_pt_v2_responses
    WHERE assessment_id = ${assessmentId}::uuid
  `) as ResponseRow[];
}

async function getAssessmentResponseRowsByToken(tableName: PartnerResponseTableName, responseToken: string) {
  if (tableName === "partner_typeform_assessment_ptbr_responses") {
    return (await sql`
      SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name, question_key, question_text, section::text, analyst_evaluation::text
      FROM partner_typeform_assessment_ptbr_responses
      WHERE typeform_response_token = ${responseToken}
    `) as ResponseRow[];
  }

  if (tableName === "partner_typeform_assessment_en_responses") {
    return (await sql`
      SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name, question_key, question_text, section::text, analyst_evaluation::text
      FROM partner_typeform_assessment_en_responses
      WHERE typeform_response_token = ${responseToken}
    `) as ResponseRow[];
  }

  if (tableName === "partner_typeform_assessment_en_v2_responses") {
    return (await sql`
      SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name, question_key, question_text, section::text, analyst_evaluation::text
      FROM partner_typeform_assessment_en_v2_responses
      WHERE typeform_response_token = ${responseToken}
    `) as ResponseRow[];
  }

  return (await sql`
    SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name, question_key, question_text, section::text, analyst_evaluation::text
    FROM partner_typeform_assessment_pt_v2_responses
    WHERE typeform_response_token = ${responseToken}
  `) as ResponseRow[];
}

async function getAssessmentResponseRowsByCompany(
  tableName: PartnerResponseTableName,
  companyName: string,
  typeformFormId?: string | null,
) {
  if (tableName === "partner_typeform_assessment_ptbr_responses") {
    return (await sql`
      SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name, question_key, question_text, section::text, analyst_evaluation::text
      FROM partner_typeform_assessment_ptbr_responses
      WHERE lower(company_name) = lower(${companyName})
        AND (${typeformFormId ?? null}::text IS NULL OR typeform_form_id = ${typeformFormId ?? null})
    `) as ResponseRow[];
  }

  if (tableName === "partner_typeform_assessment_en_responses") {
    return (await sql`
      SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name, question_key, question_text, section::text, analyst_evaluation::text
      FROM partner_typeform_assessment_en_responses
      WHERE lower(company_name) = lower(${companyName})
        AND (${typeformFormId ?? null}::text IS NULL OR typeform_form_id = ${typeformFormId ?? null})
    `) as ResponseRow[];
  }

  if (tableName === "partner_typeform_assessment_en_v2_responses") {
    return (await sql`
      SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name, question_key, question_text, section::text, analyst_evaluation::text
      FROM partner_typeform_assessment_en_v2_responses
      WHERE lower(company_name) = lower(${companyName})
        AND (${typeformFormId ?? null}::text IS NULL OR typeform_form_id = ${typeformFormId ?? null})
    `) as ResponseRow[];
  }

  return (await sql`
    SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name, question_key, question_text, section::text, analyst_evaluation::text
    FROM partner_typeform_assessment_pt_v2_responses
    WHERE lower(company_name) = lower(${companyName})
      AND (${typeformFormId ?? null}::text IS NULL OR typeform_form_id = ${typeformFormId ?? null})
  `) as ResponseRow[];
}

async function getAssessmentContext(tableName: PartnerResponseTableName, responseId: string) {
  if (tableName === "partner_typeform_assessment_ptbr_responses") {
    return (await sql`
      SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name
      FROM partner_typeform_assessment_ptbr_responses
      WHERE id = ${responseId}::uuid
      LIMIT 1
    `) as Array<Omit<AssessmentContext, "assessment_id"> & { assessment_id: string | null }>;
  }

  if (tableName === "partner_typeform_assessment_en_responses") {
    return (await sql`
      SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name
      FROM partner_typeform_assessment_en_responses
      WHERE id = ${responseId}::uuid
      LIMIT 1
    `) as Array<Omit<AssessmentContext, "assessment_id"> & { assessment_id: string | null }>;
  }

  if (tableName === "partner_typeform_assessment_en_v2_responses") {
    return (await sql`
      SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name
      FROM partner_typeform_assessment_en_v2_responses
      WHERE id = ${responseId}::uuid
      LIMIT 1
    `) as Array<Omit<AssessmentContext, "assessment_id"> & { assessment_id: string | null }>;
  }

  return (await sql`
    SELECT assessment_id::text, typeform_form_id, typeform_response_token, company_name
    FROM partner_typeform_assessment_pt_v2_responses
    WHERE id = ${responseId}::uuid
    LIMIT 1
  `) as Array<Omit<AssessmentContext, "assessment_id"> & { assessment_id: string | null }>;
}

async function getAssessmentMetadata(assessmentId: string) {
  return (await sql`
    SELECT
      a.id::text AS assessment_id,
      a.typeform_form_id,
      a.typeform_response_token,
      e.name AS company_name
    FROM assessments a
    JOIN entities e
      ON e.id = a.entity_id
    WHERE a.id = ${assessmentId}::uuid
    LIMIT 1
  `) as AssessmentContext[];
}

async function getResponseRowsForAssessmentContext(
  tableName: PartnerResponseTableName,
  context: AssessmentContext,
) {
  const byAssessment = await getAssessmentResponseRows(tableName, context.assessment_id);
  if (byAssessment.length > 0) {
    return byAssessment;
  }

  if (context.typeform_response_token) {
    const byToken = await getAssessmentResponseRowsByToken(tableName, context.typeform_response_token);
    if (byToken.length > 0) {
      return byToken;
    }
  }

  if (context.company_name) {
    const byCompany = await getAssessmentResponseRowsByCompany(tableName, context.company_name, context.typeform_form_id);
    if (byCompany.length > 0) {
      return byCompany;
    }
  }

  return [] as ResponseRow[];
}

async function getMappingsByFormId(typeformFormId: string) {
  try {
    return (await sql`
      SELECT
        m.question_key,
        m.question_text,
        m.section::text,
        m.weight
      FROM typeform_form_question_mappings m
      JOIN typeform_forms f
        ON f.id = m.typeform_form_config_id
      WHERE f.form_id = ${typeformFormId}
    `) as MappingRow[];
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      return [] as MappingRow[];
    }
    if (code === "42703") {
      return (await sql`
        SELECT
          m.question_key,
          m.question_text,
          m.section::text,
          1::numeric AS weight
        FROM typeform_form_question_mappings m
        JOIN typeform_forms f
          ON f.id = m.typeform_form_config_id
        WHERE f.form_id = ${typeformFormId}
      `) as MappingRow[];
    }
    throw error;
  }
}

export async function recalculatePartnerAssessmentDecision(
  tableName: PartnerResponseTableName,
  responseId: string,
  assessmentIdOverride?: string | null,
) {
  const contextRows = await getAssessmentContext(tableName, responseId);
  const rowContext = contextRows[0];
  const resolvedAssessmentId = assessmentIdOverride ?? rowContext?.assessment_id ?? null;

  if (!resolvedAssessmentId) {
    return;
  }

  await recalculatePartnerAssessmentDecisionByAssessmentId(resolvedAssessmentId, tableName);
}

async function recalculatePartnerAssessmentDecisionByAssessmentId(
  assessmentId: string,
  preferredTableName?: PartnerResponseTableName,
) {
  const assessmentContext = (await getAssessmentMetadata(assessmentId))[0];
  if (!assessmentContext) {
    return;
  }

  const tableOrder = preferredTableName
    ? [preferredTableName, ...partnerResponseTables.filter((item) => item !== preferredTableName)]
    : partnerResponseTables;

  let responses: ResponseRow[] = [];
  for (const tableName of tableOrder) {
    responses = await getResponseRowsForAssessmentContext(tableName, assessmentContext);
    if (responses.length > 0) {
      break;
    }
  }

  const inferredFormId =
    assessmentContext.typeform_form_id ??
    responses.find((response) => response.typeform_form_id)?.typeform_form_id ??
    null;
  const inferredResponseToken =
    assessmentContext.typeform_response_token ??
    responses.find((response) => response.typeform_response_token)?.typeform_response_token ??
    null;

  if (!inferredFormId) {
    return;
  }

  if (
    assessmentContext.typeform_form_id !== inferredFormId ||
    (!assessmentContext.typeform_response_token && inferredResponseToken)
  ) {
    await sql`
      UPDATE assessments
      SET
        typeform_form_id = ${inferredFormId},
        typeform_response_token = COALESCE(typeform_response_token, ${inferredResponseToken}),
        updated_at = now()
      WHERE id = ${assessmentId}::uuid
    `;
  }

  const [mappings, riskScoringSettings] = await Promise.all([
    getMappingsByFormId(inferredFormId),
    getPlatformSettings("RISK_SCORING", normalizeRiskScoringSettings),
  ]);
  const partnerRiskScoring = riskScoringSettings.partner;

  const mappingByKey = new Map(mappings.filter((item) => item.question_key).map((item) => [item.question_key, item]));
  const mappingByText = new Map(mappings.map((item) => [normalizeLookup(item.question_text), item]));

  const sectionTotals = new Map<ScoredSection, { weightedScore: number; totalWeight: number; answeredCount: number }>(
    scoredSections.map((section) => [section, { weightedScore: 0, totalWeight: 0, answeredCount: 0 }]),
  );

  for (const response of responses) {
    const mapped =
      (response.question_key ? mappingByKey.get(response.question_key) : undefined) ??
      mappingByText.get(normalizeLookup(response.question_text));

    const section = (mapped?.section ?? response.section ?? "").toUpperCase() as ScoredSection;
    if (!scoredSections.includes(section)) continue;

    const weight = Number(mapped?.weight ?? 1);
    if (!Number.isFinite(weight) || weight <= 0) continue;

    const evaluation = ((response.analyst_evaluation ?? "NOT_EVALUATED").toUpperCase() as AnalystEvaluation);
    const score = getEvaluationScore(evaluation, partnerRiskScoring);
    if (score === null) continue;

    const bucket = sectionTotals.get(section);
    if (!bucket) continue;

    bucket.weightedScore += weight * score;
    bucket.totalWeight += weight;
    bucket.answeredCount += 1;
  }

  const securityScoreRaw = sectionTotals.get("SECURITY");
  const privacyScoreRaw = sectionTotals.get("PRIVACY");
  const complianceScoreRaw = sectionTotals.get("COMPLIANCE");

  const securityScore = securityScoreRaw && securityScoreRaw.totalWeight > 0 ? securityScoreRaw.weightedScore / securityScoreRaw.totalWeight : null;
  const privacyScore = privacyScoreRaw && privacyScoreRaw.totalWeight > 0 ? privacyScoreRaw.weightedScore / privacyScoreRaw.totalWeight : null;
  const complianceScore = complianceScoreRaw && complianceScoreRaw.totalWeight > 0 ? complianceScoreRaw.weightedScore / complianceScoreRaw.totalWeight : null;

  const sectionWeightedScores = [
    {
      score: securityScore,
      sectionWeight: partnerRiskScoring.security_weight,
    },
    {
      score: privacyScore,
      sectionWeight: partnerRiskScoring.privacy_weight,
    },
    {
      score: complianceScore,
      sectionWeight: partnerRiskScoring.compliance_weight,
    },
  ].filter((item) => item.score !== null && item.sectionWeight > 0) as Array<{ score: number; sectionWeight: number }>;

  const combinedWeight = sectionWeightedScores.reduce((sum, item) => sum + item.sectionWeight, 0);
  const combinedScore =
    combinedWeight > 0
      ? sectionWeightedScores.reduce((sum, item) => sum + item.score * item.sectionWeight, 0) / combinedWeight
      : null;

  try {
    await sql`
      INSERT INTO assessment_decisions (
        assessment_id,
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
      ) VALUES (
        ${assessmentId}::uuid,
        ${securityScore === null ? null : Number(securityScore.toFixed(1))},
        ${toDecisionLevel(securityScore, partnerRiskScoring)}::risk_level,
        ${getSectionNote("SECURITY", securityScoreRaw?.answeredCount ?? 0, securityScoreRaw?.totalWeight ?? 0, securityScore)},
        ${privacyScore === null ? null : Number(privacyScore.toFixed(1))},
        ${toDecisionLevel(privacyScore, partnerRiskScoring)}::risk_level,
        ${getSectionNote("PRIVACY", privacyScoreRaw?.answeredCount ?? 0, privacyScoreRaw?.totalWeight ?? 0, privacyScore)},
        ${complianceScore === null ? null : Number(complianceScore.toFixed(1))},
        ${toDecisionLevel(complianceScore, partnerRiskScoring)}::risk_level,
        ${getSectionNote("COMPLIANCE", complianceScoreRaw?.answeredCount ?? 0, complianceScoreRaw?.totalWeight ?? 0, complianceScore)},
        ${combinedScore === null ? null : Number(combinedScore.toFixed(1))},
        ${getModelOneClassification({
          combinedScore,
          settings: partnerRiskScoring,
          requiredSectionLevels: [
            toDecisionLevel(securityScore, partnerRiskScoring),
            toDecisionLevel(privacyScore, partnerRiskScoring),
            toDecisionLevel(complianceScore, partnerRiskScoring),
          ],
        })}
      )
      ON CONFLICT (assessment_id)
      DO UPDATE SET
        security_score = EXCLUDED.security_score,
        security_level = EXCLUDED.security_level,
        security_note = EXCLUDED.security_note,
        privacy_score = EXCLUDED.privacy_score,
        privacy_level = EXCLUDED.privacy_level,
        privacy_note = EXCLUDED.privacy_note,
        compliance_score = EXCLUDED.compliance_score,
        compliance_level = EXCLUDED.compliance_level,
        compliance_note = EXCLUDED.compliance_note,
        combined_score = EXCLUDED.combined_score,
        classification = EXCLUDED.classification,
        updated_at = now()
    `;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== "42703") {
      throw error;
    }

    await sql`
      INSERT INTO assessment_decisions (
        assessment_id,
        security_level,
        security_note,
        privacy_level,
        privacy_note,
        compliance_level,
        compliance_note,
        combined_score,
        classification
      ) VALUES (
        ${assessmentId}::uuid,
        ${toDecisionLevel(securityScore, partnerRiskScoring)}::risk_level,
        ${getSectionNote("SECURITY", securityScoreRaw?.answeredCount ?? 0, securityScoreRaw?.totalWeight ?? 0, securityScore)},
        ${toDecisionLevel(privacyScore, partnerRiskScoring)}::risk_level,
        ${getSectionNote("PRIVACY", privacyScoreRaw?.answeredCount ?? 0, privacyScoreRaw?.totalWeight ?? 0, privacyScore)},
        ${toDecisionLevel(complianceScore, partnerRiskScoring)}::risk_level,
        ${getSectionNote("COMPLIANCE", complianceScoreRaw?.answeredCount ?? 0, complianceScoreRaw?.totalWeight ?? 0, complianceScore)},
        ${combinedScore === null ? null : Number(combinedScore.toFixed(1))},
        ${getModelOneClassification({
          combinedScore,
          settings: partnerRiskScoring,
          requiredSectionLevels: [
            toDecisionLevel(securityScore, partnerRiskScoring),
            toDecisionLevel(privacyScore, partnerRiskScoring),
            toDecisionLevel(complianceScore, partnerRiskScoring),
          ],
        })}
      )
      ON CONFLICT (assessment_id)
      DO UPDATE SET
        security_level = EXCLUDED.security_level,
        security_note = EXCLUDED.security_note,
        privacy_level = EXCLUDED.privacy_level,
        privacy_note = EXCLUDED.privacy_note,
        compliance_level = EXCLUDED.compliance_level,
        compliance_note = EXCLUDED.compliance_note,
        combined_score = EXCLUDED.combined_score,
        classification = EXCLUDED.classification,
        updated_at = now()
    `;
  }
}

async function getPartnerAssessmentIds(typeformFormId?: string) {
  return (await sql`
    SELECT a.id::text AS assessment_id
    FROM assessments a
    JOIN entities e
      ON e.id = a.entity_id
    WHERE e.kind = 'PARTNER'
      AND (${typeformFormId ?? null}::text IS NULL OR a.typeform_form_id = ${typeformFormId ?? null})
    ORDER BY a.created_at DESC
  `) as Array<{ assessment_id: string }>;
}

export async function recalculatePartnerAssessmentDecisionsForForm(typeformFormId: string) {
  const contexts = await getPartnerAssessmentIds(typeformFormId);
  for (const context of contexts) {
    await recalculatePartnerAssessmentDecisionByAssessmentId(context.assessment_id);
  }
}

export async function recalculateAllPartnerAssessmentDecisions() {
  const contexts = await getPartnerAssessmentIds();
  for (const context of contexts) {
    await recalculatePartnerAssessmentDecisionByAssessmentId(context.assessment_id);
  }
}
