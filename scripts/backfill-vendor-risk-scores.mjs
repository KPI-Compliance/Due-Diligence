import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(databaseUrl);

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

function severity(level) {
  if (level === "HIGH") return 3;
  if (level === "MEDIUM") return 2;
  if (level === "LOW") return 1;
  return 0;
}

function classify(combinedScore, settings, sectionLevels) {
  const availableLevels = sectionLevels.filter(Boolean);
  if (availableLevels.length === 0) return "Pending Review";

  const combinedLevel = toLevel(combinedScore, settings);
  const worstLevel = availableLevels.reduce((worst, current) => (severity(current) > severity(worst) ? current : worst), null);
  const finalLevel = severity(worstLevel) > severity(combinedLevel) ? worstLevel : combinedLevel;

  if (finalLevel === "HIGH") return "High";
  if (finalLevel === "MEDIUM") return "Moderate";
  if (finalLevel === "LOW") return "Low";
  return "Pending Review";
}

function sectionNote(section, bucket, score) {
  if (score == null || bucket.answeredCount === 0 || bucket.totalWeight <= 0) {
    return `No scored ${section.toLowerCase()} answers yet.`;
  }
  return `Calculated from ${bucket.answeredCount} evaluated question(s), with total weight ${bucket.totalWeight.toFixed(1)}.`;
}

function evaluationToScore(evaluation, reviewStatus, settings) {
  const normalized = String(evaluation ?? "").trim().toUpperCase();
  if (normalized === "FULLY") return settings.fully_score;
  if (normalized === "PARTIALLY") return settings.partially_score;
  if (normalized === "DOES_NOT_MEET") return settings.does_not_meet_score;
  if (normalized === "NA" || normalized === "NOT_EVALUATED") return null;
  const normalizedReviewStatus = String(reviewStatus ?? "").trim().toUpperCase();
  if (normalizedReviewStatus === "NEEDS_REVIEW" || normalizedReviewStatus === "COMPLIANT") return null;
  return null;
}

function inferSection(questionText, domain) {
  const q = normalize(questionText);
  const d = normalize(domain);

  const privacyHints = ["privacy", "privacidade", "personal data", "dados pessoais", "lgpd", "gdpr", "data subject", "consent", "retention", "dpo", "data protection"];
  if (privacyHints.some((hint) => q.includes(hint) || d.includes(hint))) return "PRIVACY";

  const securityHints = ["security", "seguranca", "infosec", "vulnerability", "vulnerabilidade", "incident", "incidente", "encryption", "criptografia", "backup", "firewall", "soc", "iso 27001", "access control", "mfa", "pentest"];
  if (securityHints.some((hint) => q.includes(hint) || d.includes(hint))) return "SECURITY";

  return null;
}

async function getVendorRiskSettings() {
  const rows = await sql.query("SELECT value FROM platform_settings WHERE key = $1 LIMIT 1", ["RISK_SCORING"]);
  const raw = rows[0]?.value ?? {};
  const source = raw.vendor && typeof raw.vendor === "object" ? raw.vendor : raw;

  return {
    security_weight: Number(source.security_weight ?? 50),
    privacy_weight: Number(source.privacy_weight ?? 50),
    fully_score: Number(source.fully_score ?? 0),
    partially_score: Number(source.partially_score ?? 5),
    does_not_meet_score: Number(source.does_not_meet_score ?? 10),
    low_max: Number(source.low_max ?? 3),
    medium_max: Number(source.medium_max ?? 6),
  };
}

async function getVendorAssessments() {
  return await sql.query(`
    SELECT
      a.id::text AS assessment_id,
      a.typeform_form_id
    FROM assessments a
    JOIN entities e
      ON e.id = a.entity_id
    WHERE e.kind = 'VENDOR'
    ORDER BY a.created_at DESC
  `);
}

async function getMappings(formId) {
  if (!formId) return [];

  try {
    return await sql.query(
      `
        SELECT
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
  } catch {
    return [];
  }
}

async function getResponses(assessmentId) {
  try {
    return await sql.query(
      `
        SELECT
          domain,
          question_text,
          review_status::text AS review_status,
          analyst_evaluation::text AS analyst_evaluation
        FROM assessment_question_responses
        WHERE assessment_id = $1::uuid
      `,
      [assessmentId],
    );
  } catch {
    return await sql.query(
      `
        SELECT
          domain,
          question_text,
          review_status::text AS review_status,
          NULL::text AS analyst_evaluation
        FROM assessment_question_responses
        WHERE assessment_id = $1::uuid
      `,
      [assessmentId],
    );
  }
}

async function recalculateAssessment(assessment, settings) {
  const [mappings, responses] = await Promise.all([
    getMappings(assessment.typeform_form_id),
    getResponses(assessment.assessment_id),
  ]);

  const mappingByText = new Map(mappings.map((item) => [normalize(item.question_text), item]));
  const sectionTotals = new Map([
    ["SECURITY", { weightedScore: 0, totalWeight: 0, answeredCount: 0 }],
    ["PRIVACY", { weightedScore: 0, totalWeight: 0, answeredCount: 0 }],
  ]);

  for (const response of responses) {
    const mapped = mappingByText.get(normalize(response.question_text));
    const mappedSectionRaw = String(mapped?.section ?? "").trim().toUpperCase();
    const mappedSection = mappedSectionRaw === "PRIVACY" || mappedSectionRaw === "SECURITY" ? mappedSectionRaw : null;
    const section = mappedSection ?? inferSection(response.question_text, response.domain);
    if (!section) continue;

    const weight = Number(mapped?.weight ?? 1);
    if (!Number.isFinite(weight) || weight <= 0) continue;

    const score = evaluationToScore(response.analyst_evaluation, response.review_status, settings);
    if (score == null) continue;

    const bucket = sectionTotals.get(section);
    if (!bucket) continue;

    bucket.weightedScore += weight * score;
    bucket.totalWeight += weight;
    bucket.answeredCount += 1;
  }

  const securityBucket = sectionTotals.get("SECURITY");
  const privacyBucket = sectionTotals.get("PRIVACY");

  const securityScore =
    securityBucket && securityBucket.totalWeight > 0
      ? Number((securityBucket.weightedScore / securityBucket.totalWeight).toFixed(1))
      : null;
  const privacyScore =
    privacyBucket && privacyBucket.totalWeight > 0
      ? Number((privacyBucket.weightedScore / privacyBucket.totalWeight).toFixed(1))
      : null;

  const weightedSections = [
    { score: securityScore, weight: settings.security_weight },
    { score: privacyScore, weight: settings.privacy_weight },
  ].filter((item) => item.score != null && item.weight > 0);

  const totalCombinedWeight = weightedSections.reduce((sum, item) => sum + item.weight, 0);
  const combinedScore =
    totalCombinedWeight > 0
      ? Number((weightedSections.reduce((sum, item) => sum + item.score * item.weight, 0) / totalCombinedWeight).toFixed(1))
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
        combined_score,
        classification
      )
      VALUES ($1, $2, $3::risk_level, $4, $5, $6::risk_level, $7, $8, $9)
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
    `,
    [
      assessment.assessment_id,
      securityScore,
      toLevel(securityScore, settings),
      sectionNote("SECURITY", securityBucket, securityScore),
      privacyScore,
      toLevel(privacyScore, settings),
      sectionNote("PRIVACY", privacyBucket, privacyScore),
      combinedScore,
      classify(combinedScore, settings, [toLevel(securityScore, settings), toLevel(privacyScore, settings)]),
    ],
  );
}

async function main() {
  const settings = await getVendorRiskSettings();
  const assessments = await getVendorAssessments();

  let processed = 0;
  for (const assessment of assessments) {
    await recalculateAssessment(assessment, settings);
    processed += 1;
  }

  console.info(`[backfill-vendor-risk-scores] processed=${processed}`);
}

main().catch((error) => {
  console.error("[backfill-vendor-risk-scores] failed:", error);
  process.exitCode = 1;
});
