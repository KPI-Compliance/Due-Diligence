import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(databaseUrl);

const partnerTables = [
  "partner_typeform_assessment_en_responses",
  "partner_typeform_assessment_ptbr_responses",
  "partner_typeform_assessment_en_v2_responses",
  "partner_typeform_assessment_pt_v2_responses",
];

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

function toLevel(score, settings) {
  if (score == null || Number.isNaN(score)) return null;
  if (score <= settings.low_max) return "LOW";
  if (score <= settings.medium_max) return "MEDIUM";
  return "HIGH";
}

function toClassification(score, settings) {
  const level = toLevel(score, settings);
  if (!level) return "Not classified";
  if (level === "HIGH") return "High Risk";
  if (level === "MEDIUM") return "Medium Risk";
  return "Low Risk";
}

function getSectionNote(section, bucket, score) {
  if (score == null || bucket.answeredCount === 0 || bucket.totalWeight <= 0) {
    return `No scored ${section.toLowerCase()} answers yet.`;
  }

  return `Calculated from ${bucket.answeredCount} evaluated question(s), with total weight ${bucket.totalWeight.toFixed(1)}.`;
}

async function getRiskSettings() {
  const [row] = await sql.query("SELECT value FROM platform_settings WHERE key = $1 LIMIT 1", ["RISK_SCORING"]);
  const raw = row?.value ?? {};

  return {
    security_weight: Number(raw.security_weight ?? 50),
    privacy_weight: Number(raw.privacy_weight ?? 30),
    compliance_weight: Number(raw.compliance_weight ?? 20),
    fully_score: Number(raw.fully_score ?? 0),
    partially_score: Number(raw.partially_score ?? 5),
    does_not_meet_score: Number(raw.does_not_meet_score ?? 10),
    low_max: Number(raw.low_max ?? 3),
    medium_max: Number(raw.medium_max ?? 6),
  };
}

async function getPartnerAssessments() {
  return await sql.query(`
    SELECT
      a.id::text AS assessment_id,
      a.typeform_form_id,
      a.typeform_response_token,
      e.name AS company_name
    FROM assessments a
    JOIN entities e
      ON e.id = a.entity_id
    WHERE e.kind = 'PARTNER'
    ORDER BY a.created_at DESC
  `);
}

async function getMappings(formId) {
  return await sql.query(
    `
      SELECT
        m.question_key,
        m.question_text,
        m.section::text AS section,
        COALESCE(m.weight, 1)::numeric AS weight
      FROM typeform_form_question_mappings m
      JOIN typeform_forms f
        ON f.id = m.typeform_form_config_id
      WHERE f.form_id = $1
    `,
    [formId],
  );
}

async function getResponses(table, assessment) {
  const byAssessment = await sql.query(
    `SELECT assessment_id::text, typeform_form_id, question_key, question_text, section::text AS section, analyst_evaluation::text AS analyst_evaluation
     FROM ${table}
     WHERE assessment_id = $1`,
    [assessment.assessment_id],
  );
  if (byAssessment.length > 0) return byAssessment;

  if (assessment.typeform_response_token) {
    const byToken = await sql.query(
      `SELECT assessment_id::text, typeform_form_id, question_key, question_text, section::text AS section, analyst_evaluation::text AS analyst_evaluation
       FROM ${table}
       WHERE typeform_response_token = $1`,
      [assessment.typeform_response_token],
    );
    if (byToken.length > 0) return byToken;
  }

  if (assessment.company_name) {
    const byCompany = await sql.query(
      `SELECT assessment_id::text, typeform_form_id, question_key, question_text, section::text AS section, analyst_evaluation::text AS analyst_evaluation
       FROM ${table}
       WHERE lower(company_name) = lower($1)
         AND ($2::text IS NULL OR typeform_form_id = $2)`,
      [assessment.company_name, assessment.typeform_form_id],
    );
    if (byCompany.length > 0) return byCompany;
  }

  return [];
}

async function recalculateAssessment(assessment, settings) {
  if (!assessment.typeform_form_id) {
    return { updated: false, reason: "missing_form_id" };
  }

  const mappings = await getMappings(assessment.typeform_form_id);
  const mappingByKey = new Map(mappings.filter((item) => item.question_key).map((item) => [item.question_key, item]));
  const mappingByText = new Map(mappings.map((item) => [normalize(item.question_text), item]));

  let responses = [];
  for (const table of partnerTables) {
    responses = await getResponses(table, assessment);
    if (responses.length > 0) break;
  }

  const sectionTotals = new Map([
    ["SECURITY", { weightedScore: 0, totalWeight: 0, answeredCount: 0 }],
    ["PRIVACY", { weightedScore: 0, totalWeight: 0, answeredCount: 0 }],
    ["COMPLIANCE", { weightedScore: 0, totalWeight: 0, answeredCount: 0 }],
  ]);

  for (const response of responses) {
    const mapped =
      (response.question_key ? mappingByKey.get(response.question_key) : undefined) ??
      mappingByText.get(normalize(response.question_text));

    const section = String(mapped?.section ?? response.section ?? "").toUpperCase();
    const bucket = sectionTotals.get(section);
    if (!bucket) continue;

    const weight = Number(mapped?.weight ?? 1);
    if (!Number.isFinite(weight) || weight <= 0) continue;

    const evaluation = String(response.analyst_evaluation ?? "NOT_EVALUATED").toUpperCase();
    const score =
      evaluation === "FULLY"
        ? settings.fully_score
        : evaluation === "PARTIALLY"
          ? settings.partially_score
          : evaluation === "DOES_NOT_MEET"
            ? settings.does_not_meet_score
            : null;

    if (score === null) continue;

    bucket.weightedScore += weight * score;
    bucket.totalWeight += weight;
    bucket.answeredCount += 1;
  }

  const securityBucket = sectionTotals.get("SECURITY");
  const privacyBucket = sectionTotals.get("PRIVACY");
  const complianceBucket = sectionTotals.get("COMPLIANCE");

  const securityScore =
    securityBucket && securityBucket.totalWeight > 0
      ? Number((securityBucket.weightedScore / securityBucket.totalWeight).toFixed(1))
      : null;
  const privacyScore =
    privacyBucket && privacyBucket.totalWeight > 0
      ? Number((privacyBucket.weightedScore / privacyBucket.totalWeight).toFixed(1))
      : null;
  const complianceScore =
    complianceBucket && complianceBucket.totalWeight > 0
      ? Number((complianceBucket.weightedScore / complianceBucket.totalWeight).toFixed(1))
      : null;

  const weightedSections = [
    { score: securityScore, weight: settings.security_weight },
    { score: privacyScore, weight: settings.privacy_weight },
    { score: complianceScore, weight: settings.compliance_weight },
  ].filter((item) => item.score !== null && item.weight > 0);

  const totalCombinedWeight = weightedSections.reduce((sum, item) => sum + item.weight, 0);
  const combinedScore =
    totalCombinedWeight > 0
      ? Number(
          (
            weightedSections.reduce((sum, item) => sum + item.score * item.weight, 0) / totalCombinedWeight
          ).toFixed(1),
        )
      : null;

  await sql.query(
    `
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
      )
      VALUES ($1, $2, $3::risk_level, $4, $5, $6::risk_level, $7, $8, $9::risk_level, $10, $11, $12)
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
    `,
    [
      assessment.assessment_id,
      securityScore,
      toLevel(securityScore, settings),
      getSectionNote("SECURITY", securityBucket, securityScore),
      privacyScore,
      toLevel(privacyScore, settings),
      getSectionNote("PRIVACY", privacyBucket, privacyScore),
      complianceScore,
      toLevel(complianceScore, settings),
      getSectionNote("COMPLIANCE", complianceBucket, complianceScore),
      combinedScore,
      toClassification(combinedScore, settings),
    ],
  );

  return {
    updated: true,
    scoredSections: [securityScore, privacyScore, complianceScore].filter((value) => value !== null).length,
  };
}

const settings = await getRiskSettings();
const assessments = await getPartnerAssessments();

let updatedCount = 0;
let skippedCount = 0;
let scoredCount = 0;

for (const assessment of assessments) {
  const result = await recalculateAssessment(assessment, settings);
  if (!result.updated) {
    skippedCount += 1;
    continue;
  }

  updatedCount += 1;
  if (result.scoredSections > 0) {
    scoredCount += 1;
  }
}

console.log(
  JSON.stringify(
    {
      totalAssessments: assessments.length,
      updatedCount,
      scoredCount,
      skippedCount,
    },
    null,
    2,
  ),
);
