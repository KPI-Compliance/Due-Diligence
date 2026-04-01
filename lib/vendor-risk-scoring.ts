import { sql } from "@/lib/db";
import { normalizeLooseLookup } from "@/lib/normalization";
import { getPlatformSettings, normalizeRiskScoringSettings, type RiskScoringProfile } from "@/lib/platform-settings";

type VendorSection = "PRIVACY" | "SECURITY";
type AnalystEvaluation = "NOT_EVALUATED" | "NA" | "DOES_NOT_MEET" | "PARTIALLY" | "FULLY";
type DecisionLevel = "LOW" | "MEDIUM" | "HIGH";

type VendorResponseRow = {
  domain: string;
  question_text: string;
  review_status: string | null;
  analyst_evaluation: string | null;
};

type MappingRow = {
  question_text: string;
  section: string;
  weight: number;
};

const scoredSections: VendorSection[] = ["PRIVACY", "SECURITY"];

function toDecisionLevel(score: number | null, settings: RiskScoringProfile): DecisionLevel | null {
  if (score === null || Number.isNaN(score)) return null;
  if (score <= settings.low_max) return "LOW";
  if (score <= settings.medium_max) return "MEDIUM";
  return "HIGH";
}

function getEvaluationScore(evaluation: AnalystEvaluation, settings: RiskScoringProfile) {
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

function normalizeEvaluation(input: string | null, reviewStatus: string | null): AnalystEvaluation {
  const normalized = (input ?? "").trim().toUpperCase();
  if (
    normalized === "NOT_EVALUATED" ||
    normalized === "NA" ||
    normalized === "DOES_NOT_MEET" ||
    normalized === "PARTIALLY" ||
    normalized === "FULLY"
  ) {
    return normalized;
  }

  const normalizedReviewStatus = String(reviewStatus ?? "").trim().toUpperCase();
  if (normalizedReviewStatus === "NEEDS_REVIEW" || normalizedReviewStatus === "COMPLIANT") {
    return "NOT_EVALUATED";
  }

  return "NOT_EVALUATED";
}

function inferVendorSection(question: string, domain: string): VendorSection | null {
  const normalizedQuestion = normalizeLooseLookup(question);
  const normalizedDomain = normalizeLooseLookup(domain);

  const privacyHints = [
    "privacy",
    "privacidade",
    "personal data",
    "dados pessoais",
    "lgpd",
    "gdpr",
    "data subject",
    "consent",
    "retention",
    "dpo",
    "data protection",
  ];
  if (privacyHints.some((hint) => normalizedQuestion.includes(hint) || normalizedDomain.includes(hint))) {
    return "PRIVACY";
  }

  const securityHints = [
    "security",
    "seguranca",
    "infosec",
    "vulnerability",
    "vulnerabilidade",
    "incident",
    "incidente",
    "encryption",
    "criptografia",
    "backup",
    "firewall",
    "soc",
    "iso 27001",
    "access control",
    "mfa",
    "pentest",
  ];
  if (securityHints.some((hint) => normalizedQuestion.includes(hint) || normalizedDomain.includes(hint))) {
    return "SECURITY";
  }

  return null;
}

function getClassification(input: {
  combinedScore: number | null;
  settings: RiskScoringProfile;
  sectionLevels: Array<DecisionLevel | null>;
}) {
  const availableSectionLevels = input.sectionLevels.filter(Boolean) as DecisionLevel[];
  if (availableSectionLevels.length === 0) {
    return "Pending Review";
  }

  const combinedLevel = toDecisionLevel(input.combinedScore, input.settings);
  const worstSectionLevel = availableSectionLevels.reduce<DecisionLevel | null>((worst, current) => {
    return decisionLevelSeverity(current) > decisionLevelSeverity(worst) ? current : worst;
  }, null);
  const finalLevel = decisionLevelSeverity(worstSectionLevel) > decisionLevelSeverity(combinedLevel) ? worstSectionLevel : combinedLevel;

  if (finalLevel === "HIGH") return "High";
  if (finalLevel === "MEDIUM") return "Moderate";
  if (finalLevel === "LOW") return "Low";
  return "Pending Review";
}

function getSectionNote(section: VendorSection, answeredCount: number, totalWeight: number, score: number | null) {
  if (score === null || answeredCount === 0 || totalWeight <= 0) {
    return `No scored ${section.toLowerCase()} answers yet.`;
  }

  return `Calculated from ${answeredCount} evaluated question(s), with total weight ${totalWeight.toFixed(1)}.`;
}

async function getMappingsByFormId(typeformFormId: string | null) {
  if (!typeformFormId) return [] as MappingRow[];

  try {
    return (await sql`
      SELECT
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

export async function recalculateVendorAssessmentDecisionByAssessmentId(assessmentId: string) {
  const assessmentRows = (await sql`
    SELECT
      a.typeform_form_id,
      e.kind
    FROM assessments a
    JOIN entities e
      ON e.id = a.entity_id
    WHERE a.id = ${assessmentId}::uuid
    LIMIT 1
  `) as Array<{ typeform_form_id: string | null; kind: string }>;
  const assessment = assessmentRows[0];

  if (!assessment || String(assessment.kind).toUpperCase() !== "VENDOR") {
    return;
  }

  let responses: VendorResponseRow[] = [];
  try {
    responses = (await sql`
      SELECT
        domain,
        question_text,
        review_status::text,
        analyst_evaluation::text
      FROM assessment_question_responses
      WHERE assessment_id = ${assessmentId}::uuid
    `) as VendorResponseRow[];
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== "42703" && code !== "42704") {
      throw error;
    }
    responses = (await sql`
      SELECT
        domain,
        question_text,
        review_status::text
      FROM assessment_question_responses
      WHERE assessment_id = ${assessmentId}::uuid
    `) as VendorResponseRow[];
  }

  const [mappings, riskScoringSettings] = await Promise.all([
    getMappingsByFormId(assessment.typeform_form_id),
    getPlatformSettings("RISK_SCORING", normalizeRiskScoringSettings),
  ]);
  const vendorRiskScoring = riskScoringSettings.vendor;

  const mappingByText = new Map(mappings.map((item) => [normalizeLooseLookup(item.question_text), item]));

  const sectionTotals = new Map<VendorSection, { weightedScore: number; totalWeight: number; answeredCount: number }>(
    scoredSections.map((section) => [section, { weightedScore: 0, totalWeight: 0, answeredCount: 0 }]),
  );

  for (const response of responses) {
    const mapped = mappingByText.get(normalizeLooseLookup(response.question_text));
    const mappedSectionRaw = (mapped?.section ?? "").trim().toUpperCase();
    const mappedSection = mappedSectionRaw === "PRIVACY" || mappedSectionRaw === "SECURITY" ? mappedSectionRaw : null;
    const section = mappedSection ?? inferVendorSection(response.question_text, response.domain ?? "");
    if (!section) continue;

    const weight = Number(mapped?.weight ?? 1);
    if (!Number.isFinite(weight) || weight <= 0) continue;

    const evaluation = normalizeEvaluation(response.analyst_evaluation ?? null, response.review_status ?? null);
    const score = getEvaluationScore(evaluation, vendorRiskScoring);
    if (score === null) continue;

    const bucket = sectionTotals.get(section);
    if (!bucket) continue;

    bucket.weightedScore += weight * score;
    bucket.totalWeight += weight;
    bucket.answeredCount += 1;
  }

  const securityScoreRaw = sectionTotals.get("SECURITY");
  const privacyScoreRaw = sectionTotals.get("PRIVACY");

  const securityScore = securityScoreRaw && securityScoreRaw.totalWeight > 0 ? securityScoreRaw.weightedScore / securityScoreRaw.totalWeight : null;
  const privacyScore = privacyScoreRaw && privacyScoreRaw.totalWeight > 0 ? privacyScoreRaw.weightedScore / privacyScoreRaw.totalWeight : null;

  const sectionWeightedScores = [
    {
      score: securityScore,
      sectionWeight: vendorRiskScoring.security_weight,
    },
    {
      score: privacyScore,
      sectionWeight: vendorRiskScoring.privacy_weight,
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
        combined_score,
        classification
      ) VALUES (
        ${assessmentId}::uuid,
        ${securityScore === null ? null : Number(securityScore.toFixed(1))},
        ${toDecisionLevel(securityScore, vendorRiskScoring)}::risk_level,
        ${getSectionNote("SECURITY", securityScoreRaw?.answeredCount ?? 0, securityScoreRaw?.totalWeight ?? 0, securityScore)},
        ${privacyScore === null ? null : Number(privacyScore.toFixed(1))},
        ${toDecisionLevel(privacyScore, vendorRiskScoring)}::risk_level,
        ${getSectionNote("PRIVACY", privacyScoreRaw?.answeredCount ?? 0, privacyScoreRaw?.totalWeight ?? 0, privacyScore)},
        ${combinedScore === null ? null : Number(combinedScore.toFixed(1))},
        ${getClassification({
          combinedScore,
          settings: vendorRiskScoring,
          sectionLevels: [toDecisionLevel(securityScore, vendorRiskScoring), toDecisionLevel(privacyScore, vendorRiskScoring)],
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
        combined_score,
        classification
      ) VALUES (
        ${assessmentId}::uuid,
        ${toDecisionLevel(securityScore, vendorRiskScoring)}::risk_level,
        ${getSectionNote("SECURITY", securityScoreRaw?.answeredCount ?? 0, securityScoreRaw?.totalWeight ?? 0, securityScore)},
        ${toDecisionLevel(privacyScore, vendorRiskScoring)}::risk_level,
        ${getSectionNote("PRIVACY", privacyScoreRaw?.answeredCount ?? 0, privacyScoreRaw?.totalWeight ?? 0, privacyScore)},
        ${combinedScore === null ? null : Number(combinedScore.toFixed(1))},
        ${getClassification({
          combinedScore,
          settings: vendorRiskScoring,
          sectionLevels: [toDecisionLevel(securityScore, vendorRiskScoring), toDecisionLevel(privacyScore, vendorRiskScoring)],
        })}
      )
      ON CONFLICT (assessment_id)
      DO UPDATE SET
        security_level = EXCLUDED.security_level,
        security_note = EXCLUDED.security_note,
        privacy_level = EXCLUDED.privacy_level,
        privacy_note = EXCLUDED.privacy_note,
        combined_score = EXCLUDED.combined_score,
        classification = EXCLUDED.classification,
        updated_at = now()
    `;
  }
}

async function getVendorAssessmentIds() {
  return (await sql`
    SELECT a.id::text AS assessment_id
    FROM assessments a
    JOIN entities e
      ON e.id = a.entity_id
    WHERE e.kind = 'VENDOR'
    ORDER BY a.created_at DESC
  `) as Array<{ assessment_id: string }>;
}

async function recalculateVendorAssessmentDecisionBatch(assessmentIds: string[]) {
  await Promise.allSettled(assessmentIds.map((assessmentId) => recalculateVendorAssessmentDecisionByAssessmentId(assessmentId)));
}

export async function recalculateAllVendorAssessmentDecisions() {
  const contexts = await getVendorAssessmentIds();
  for (let index = 0; index < contexts.length; index += 5) {
    await recalculateVendorAssessmentDecisionBatch(
      contexts.slice(index, index + 5).map((context) => context.assessment_id),
    );
  }
}
