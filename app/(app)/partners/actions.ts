"use server";

import { redirect } from "next/navigation";
import { resolveUserAccess } from "@/lib/access-control";
import { getSessionErrorCode, refreshServerActionSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  addInternalCommentToConfiguredJiraIssue,
  updateConfiguredJiraIssueSecRisk,
  updateConfiguredJiraIssueWorkflowStatus,
} from "@/lib/jira";
import { recalculatePartnerAssessmentDecision } from "@/lib/partner-risk-scoring";
import { syncExternalQuestionnaireForEntity } from "@/lib/typeform-sync";

const allowedTables = new Set([
  "partner_typeform_assessment_en_responses",
  "partner_typeform_assessment_ptbr_responses",
  "partner_typeform_assessment_en_v2_responses",
  "partner_typeform_assessment_pt_v2_responses",
]);

const allowedEvaluations = new Set(["NOT_EVALUATED", "NA", "DOES_NOT_MEET", "PARTIALLY", "FULLY"]);
const allowedSections = new Set(["Compliance", "Privacy", "Security"]);
const allowedDecisionOptions = new Set(["APPROVED", "APPROVED_WITH_RESTRICTIONS", "REJECTED"]);
const allowedWorkflowStatuses = new Set(["Opened", "Red Team", "Concluido"]);
const allowedManualClassifications = new Set([
  "Pending Review",
  "Low",
  "Moderate",
  "High",
  "Extreme",
  "Low Risk",
  "Medium Risk",
  "High Risk",
  "Critical Risk",
]);

function elapsedMs(startTime: number) {
  return Date.now() - startTime;
}

async function getRepresentativeResponseIdForAssessment(tableName: string, assessmentId: string) {
  if (tableName === "partner_typeform_assessment_ptbr_responses") {
    const rows = (await sql`
      SELECT id::text
      FROM partner_typeform_assessment_ptbr_responses
      WHERE assessment_id = ${assessmentId}::uuid
      ORDER BY question_order ASC, created_at ASC
      LIMIT 1
    `) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  if (tableName === "partner_typeform_assessment_en_responses") {
    const rows = (await sql`
      SELECT id::text
      FROM partner_typeform_assessment_en_responses
      WHERE assessment_id = ${assessmentId}::uuid
      ORDER BY question_order ASC, created_at ASC
      LIMIT 1
    `) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  if (tableName === "partner_typeform_assessment_en_v2_responses") {
    const rows = (await sql`
      SELECT id::text
      FROM partner_typeform_assessment_en_v2_responses
      WHERE assessment_id = ${assessmentId}::uuid
      ORDER BY question_order ASC, created_at ASC
      LIMIT 1
    `) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  const rows = (await sql`
    SELECT id::text
    FROM partner_typeform_assessment_pt_v2_responses
    WHERE assessment_id = ${assessmentId}::uuid
    ORDER BY question_order ASC, created_at ASC
    LIMIT 1
  `) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function refreshPartnerExternalQuestionnaire(formData: FormData) {
  const sessionResult = await refreshServerActionSession("partners.refreshPartnerExternalQuestionnaire");
  if (!sessionResult.session) {
    redirect(`/?error=${encodeURIComponent(getSessionErrorCode(sessionResult.reason))}`);
  }
  const access = await resolveUserAccess(sessionResult.session.email);
  if (!access.permissions.canWritePartners) {
    redirect("/dashboard");
  }

  const entitySlug = String(formData.get("entity_slug") ?? "").trim();
  if (!entitySlug) {
    throw new Error("Invalid partner refresh payload.");
  }

  const entityRows = (await sql`
    SELECT id::text, name, jira_issue_key, contact_email, jira_issue_created_at::text AS jira_issue_created_at
    FROM entities
    WHERE slug = ${entitySlug}
      AND kind = 'PARTNER'
    LIMIT 1
  `) as Array<{
    id: string;
    name: string;
    jira_issue_key: string | null;
    contact_email: string | null;
    jira_issue_created_at: string | null;
  }>;

  const entity = entityRows[0];
  if (!entity) {
    redirect(`/partners/${entitySlug}?tab=external_questionnaire&sync_error=not_found`);
  }

  let result: Awaited<ReturnType<typeof syncExternalQuestionnaireForEntity>>;
  try {
    result = await syncExternalQuestionnaireForEntity({
      entityId: entity.id,
      entityName: entity.name,
      entityKind: "PARTNER",
      jiraIssueKey: entity.jira_issue_key,
      entityContactEmail: entity.contact_email,
      entityJiraIssueCreatedAt: entity.jira_issue_created_at,
      // Scan every enabled Partner + external_questionnaire row in typeform_forms (Settings).
      // Do not pass assessment.typeform_form_id — that narrowed the API scan to one form and missed others (e.g. PTBR vs V2).
      formId: null,
    });
  } catch {
    redirect(`/partners/${entitySlug}?tab=external_questionnaire&sync_error=1`);
  }

  if (result.status === "typeform_forbidden") {
    redirect(`/partners/${entitySlug}?tab=external_questionnaire&sync_error=typeform_403`);
  }

  if (result.status === "no_match") {
    redirect(`/partners/${entitySlug}?tab=external_questionnaire&sync_empty=1`);
  }

  if (result.status !== "updated" && result.status !== "already_linked") {
    redirect(`/partners/${entitySlug}?tab=external_questionnaire&sync_error=1`);
  }

  redirect(`/partners/${entitySlug}?tab=external_questionnaire&sync_forced=1`);
}

export async function savePartnerAssessmentDecision(formData: FormData) {
  const sessionResult = await refreshServerActionSession("partners.savePartnerAssessmentDecision");
  if (!sessionResult.session) {
    redirect(`/?error=${encodeURIComponent(getSessionErrorCode(sessionResult.reason))}`);
  }
  const access = await resolveUserAccess(sessionResult.session.email);
  if (!access.permissions.canWritePartners) {
    redirect("/dashboard");
  }

  const entitySlug = String(formData.get("entity_slug") ?? "").trim();
  const assessmentId = String(formData.get("assessment_id") ?? "").trim();
  const jiraIssueKey = String(formData.get("jira_issue_key") ?? "").trim();
  const submitIntent = String(formData.get("submit_intent") ?? "save_draft").trim();
  const selectedOptionRaw = String(formData.get("selected_option") ?? "APPROVED_WITH_RESTRICTIONS").trim().toUpperCase();
  const selectedOption = allowedDecisionOptions.has(selectedOptionRaw) ? selectedOptionRaw : "APPROVED_WITH_RESTRICTIONS";
  const conditionsForApproval = String(formData.get("conditions_for_approval") ?? "").trim();
  const mitigationPlan = String(formData.get("mitigation_plan") ?? "").trim();
  const approvalExpiresAtRaw = String(formData.get("approval_expires_at") ?? "").trim();
  const manualClassificationRaw = String(formData.get("manual_classification") ?? "").trim();
  const manualClassification = allowedManualClassifications.has(manualClassificationRaw) ? manualClassificationRaw : null;
  const workflowStatusRaw = String(formData.get("workflow_status_label") ?? "").trim();
  const manualWorkflowStatus = allowedWorkflowStatuses.has(workflowStatusRaw) ? workflowStatusRaw : null;
  const approvedFinalObservation = String(formData.get("approved_final_observation") ?? "").trim();

  if (!entitySlug || !assessmentId) {
    throw new Error("Invalid partner decision payload.");
  }

  const approvalExpiresAt = /^\d{4}-\d{2}-\d{2}$/.test(approvalExpiresAtRaw) ? approvalExpiresAtRaw : null;
  const finalizeDecision = submitIntent === "finalize_assessment";
  const reopenDecision = submitIntent === "reopen_assessment";

  if (manualWorkflowStatus === "Concluido" && !finalizeDecision) {
    const finalizedRows = (await sql`
      SELECT finalized_at
      FROM assessment_decisions
      WHERE assessment_id = ${assessmentId}::uuid
      LIMIT 1
    `) as Array<{ finalized_at: string | null }>;
    const hasFinalizedDecision = Boolean(finalizedRows[0]?.finalized_at);
    if (!hasFinalizedDecision) {
      redirect(`/partners/${entitySlug}?tab=decision&status_guard=1`);
    }
  }

  const effectiveWorkflowStatus = finalizeDecision ? "Concluido" : reopenDecision ? "Opened" : manualWorkflowStatus;

  await sql`
    INSERT INTO assessment_decisions (
      assessment_id,
      selected_option,
      conditions_for_approval,
      mitigation_plan,
      approval_expires_at,
      classification,
      finalized_at
    )
    VALUES (
      ${assessmentId}::uuid,
      ${selectedOption}::decision_option,
      ${conditionsForApproval || null},
      ${mitigationPlan || null},
      ${approvalExpiresAt}::date,
      ${manualClassification},
      CASE WHEN ${finalizeDecision} THEN now() ELSE NULL END
    )
    ON CONFLICT (assessment_id)
    DO UPDATE SET
      selected_option = EXCLUDED.selected_option,
      conditions_for_approval = EXCLUDED.conditions_for_approval,
      mitigation_plan = EXCLUDED.mitigation_plan,
      approval_expires_at = EXCLUDED.approval_expires_at,
      classification = EXCLUDED.classification,
      finalized_at = CASE
        WHEN ${finalizeDecision} THEN now()
        WHEN ${reopenDecision} THEN NULL
        ELSE assessment_decisions.finalized_at
      END,
      updated_at = now()
  `;

  if (effectiveWorkflowStatus === "Opened") {
    await sql`
      UPDATE assessments
      SET
        status = 'PENDING',
        completed_at = NULL,
        updated_at = now()
      WHERE id = ${assessmentId}::uuid
    `;
    await sql`
      UPDATE entities e
      SET
        status = 'PENDING',
        status_label = 'Opened',
        updated_at = now()
      FROM assessments a
      WHERE a.id = ${assessmentId}::uuid
        AND a.entity_id = e.id
    `;
  } else if (effectiveWorkflowStatus === "Red Team") {
    await sql`
      UPDATE assessments
      SET
        status = 'IN_REVIEW',
        completed_at = NULL,
        updated_at = now()
      WHERE id = ${assessmentId}::uuid
    `;
    await sql`
      UPDATE entities e
      SET
        status = 'IN_REVIEW',
        status_label = 'Red Team',
        updated_at = now()
      FROM assessments a
      WHERE a.id = ${assessmentId}::uuid
        AND a.entity_id = e.id
    `;
  } else if (effectiveWorkflowStatus === "Concluido") {
    await sql`
      UPDATE assessments
      SET
        status = 'COMPLETED',
        completed_at = COALESCE(completed_at, now()),
        progress_percent = 100,
        updated_at = now()
      WHERE id = ${assessmentId}::uuid
    `;
    await sql`
      UPDATE entities e
      SET
        status = 'COMPLETED',
        status_label = 'Concluido',
        updated_at = now()
      FROM assessments a
      WHERE a.id = ${assessmentId}::uuid
        AND a.entity_id = e.id
    `;
  }

  const decisionNoteValue = selectedOption === "APPROVED" ? approvedFinalObservation || null : null;
  const updatedNotes = (await sql`
    UPDATE assessment_notes
    SET notes = ${decisionNoteValue}
    WHERE assessment_id = ${assessmentId}::uuid
      AND section = 'Decision'
    RETURNING id
  `) as Array<{ id: string }>;

  if (updatedNotes.length === 0 && decisionNoteValue !== null) {
    await sql`
      INSERT INTO assessment_notes (assessment_id, section, notes)
      VALUES (${assessmentId}::uuid, 'Decision', ${decisionNoteValue})
    `;
  }

  if (jiraIssueKey) {
    try {
      await updateConfiguredJiraIssueSecRisk({
        issueKey: jiraIssueKey,
        entityKind: "PARTNER",
        classification: manualClassificationRaw,
      });
    } catch {
      redirect(`/partners/${entitySlug}?tab=decision&saved=1&jira_error=1`);
    }

    if (effectiveWorkflowStatus) {
      try {
        await updateConfiguredJiraIssueWorkflowStatus({
          issueKey: jiraIssueKey,
          entityKind: "PARTNER",
          workflowStatusLabel: effectiveWorkflowStatus,
        });
      } catch (error) {
        console.warn("[partners.savePartnerAssessmentDecision] jira workflow status sync skipped", {
          entitySlug,
          jiraIssueKey,
          workflowStatusLabel: effectiveWorkflowStatus,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (finalizeDecision) {
    let jiraSynced = false;
    if (selectedOption === "APPROVED" && approvedFinalObservation && jiraIssueKey) {
      try {
        await addInternalCommentToConfiguredJiraIssue({
          issueKey: jiraIssueKey,
          entityKind: "PARTNER",
          commentBody: `Final approved decision\n\nInternal observation:\n"${approvedFinalObservation}"`,
        });
        jiraSynced = true;
      } catch {
        redirect(`/partners/${entitySlug}?tab=decision&saved=1&jira_error=1`);
      }
    }
    redirect(`/partners/${entitySlug}?tab=decision&saved=1${jiraSynced ? "&jira_synced=1" : ""}`);
  }

  if (reopenDecision) {
    redirect(`/partners/${entitySlug}?tab=decision&saved=1`);
  }

  redirect(`/partners/${entitySlug}?tab=decision&saved=1`);
}

export async function savePartnerExternalQuestionnaireSection(formData: FormData) {
  const requestStartedAt = Date.now();
  const sessionResult = await refreshServerActionSession("partners.savePartnerExternalQuestionnaireSection");
  if (!sessionResult.session) {
    redirect(`/?error=${encodeURIComponent(getSessionErrorCode(sessionResult.reason))}`);
  }
  const access = await resolveUserAccess(sessionResult.session.email);
  if (!access.permissions.canWritePartners) {
    redirect("/dashboard");
  }

  const entitySlug = String(formData.get("entity_slug") ?? "").trim();
  const assessmentId = String(formData.get("assessment_id") ?? "").trim() || null;
  const tableName = String(formData.get("response_table") ?? "").trim();
  const activeTab = String(formData.get("active_tab") ?? "external_questionnaire").trim() || "external_questionnaire";
  const activeSection = String(formData.get("active_section") ?? "Common").trim() || "Common";
  const sectionFinalObservation = String(formData.get("section_final_observation") ?? "").trim();
  const submitIntent = String(formData.get("submit_intent") ?? "save_section").trim();
  const jiraIssueKey = String(formData.get("jira_issue_key") ?? "").trim();
  const responseIds = formData.getAll("response_id").map((value) => String(value).trim()).filter(Boolean);

  if (!entitySlug || !allowedTables.has(tableName)) {
    throw new Error("Invalid questionnaire save payload.");
  }

  if (submitIntent !== "save_final_observation") {
    const responseUpdateStartedAt = Date.now();
    let updatedRows = 0;
    const analystUserRows = (await sql`
      SELECT id::text
      FROM users
      WHERE lower(email) = lower(${sessionResult.session.email})
      LIMIT 1
    `) as Array<{ id: string }>;
    const analystUserId = analystUserRows[0]?.id ?? null;

    for (const responseId of responseIds) {
      const evaluationRaw = String(formData.get(`evaluation_${responseId}`) ?? "NOT_EVALUATED").trim().toUpperCase();
      const analystEvaluation = allowedEvaluations.has(evaluationRaw) ? evaluationRaw : "NOT_EVALUATED";
      const analystObservations = String(formData.get(`observations_${responseId}`) ?? "").trim();

      if (tableName === "partner_typeform_assessment_ptbr_responses") {
        const result = (await sql`
          UPDATE partner_typeform_assessment_ptbr_responses
          SET
            analyst_evaluation = ${analystEvaluation}::analyst_evaluation_status,
            analyst_observations = ${analystObservations},
            analyst_user_id = CASE
              WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
              WHEN ${analystUserId ?? null}::uuid IS NOT NULL THEN ${analystUserId ?? null}::uuid
              ELSE analyst_user_id
            END,
            analyzed_at = CASE
              WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
              ELSE now()
            END
          WHERE id = ${responseId}::uuid
          RETURNING id
        `) as Array<{ id: string }>;
        updatedRows += result.length;
        continue;
      }

      if (tableName === "partner_typeform_assessment_en_responses") {
        const result = (await sql`
          UPDATE partner_typeform_assessment_en_responses
          SET
            analyst_evaluation = ${analystEvaluation}::analyst_evaluation_status,
            analyst_observations = ${analystObservations},
            analyst_user_id = CASE
              WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
              WHEN ${analystUserId ?? null}::uuid IS NOT NULL THEN ${analystUserId ?? null}::uuid
              ELSE analyst_user_id
            END,
            analyzed_at = CASE
              WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
              ELSE now()
            END
          WHERE id = ${responseId}::uuid
          RETURNING id
        `) as Array<{ id: string }>;
        updatedRows += result.length;
        continue;
      }

      if (tableName === "partner_typeform_assessment_en_v2_responses") {
        const result = (await sql`
          UPDATE partner_typeform_assessment_en_v2_responses
          SET
            analyst_evaluation = ${analystEvaluation}::analyst_evaluation_status,
            analyst_observations = ${analystObservations},
            analyst_user_id = CASE
              WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
              WHEN ${analystUserId ?? null}::uuid IS NOT NULL THEN ${analystUserId ?? null}::uuid
              ELSE analyst_user_id
            END,
            analyzed_at = CASE
              WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
              ELSE now()
            END
          WHERE id = ${responseId}::uuid
          RETURNING id
        `) as Array<{ id: string }>;
        updatedRows += result.length;
        continue;
      }

      const result = (await sql`
        UPDATE partner_typeform_assessment_pt_v2_responses
        SET
          analyst_evaluation = ${analystEvaluation}::analyst_evaluation_status,
          analyst_observations = ${analystObservations},
          analyst_user_id = CASE
            WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
            WHEN ${analystUserId ?? null}::uuid IS NOT NULL THEN ${analystUserId ?? null}::uuid
            ELSE analyst_user_id
          END,
          analyzed_at = CASE
            WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
            ELSE now()
          END
        WHERE id = ${responseId}::uuid
        RETURNING id
      `) as Array<{ id: string }>;
      updatedRows += result.length;
    }

    if (responseIds.length > 0 && updatedRows === 0) {
      throw new Error("No questionnaire responses were updated.");
    }

    console.info("[partners.savePartnerExternalQuestionnaireSection] response updates completed", {
      entitySlug,
      activeSection,
      submitIntent,
      responseCount: responseIds.length,
      updatedRows,
      durationMs: elapsedMs(responseUpdateStartedAt),
    });

    const responseIdForScoring =
      responseIds[0] ?? (assessmentId ? await getRepresentativeResponseIdForAssessment(tableName, assessmentId) : null);

    if (responseIdForScoring) {
      const scoringStartedAt = Date.now();
      await recalculatePartnerAssessmentDecision(
        tableName as
          | "partner_typeform_assessment_en_responses"
          | "partner_typeform_assessment_ptbr_responses"
          | "partner_typeform_assessment_en_v2_responses"
          | "partner_typeform_assessment_pt_v2_responses",
        responseIdForScoring,
        assessmentId,
      );
      console.info("[partners.savePartnerExternalQuestionnaireSection] scoring completed", {
        entitySlug,
        activeSection,
        submitIntent,
        durationMs: elapsedMs(scoringStartedAt),
      });
    }
  }

  if (assessmentId && allowedSections.has(activeSection)) {
    const noteSaveStartedAt = Date.now();
    const noteValue = sectionFinalObservation || null;
    const updatedNotes = (await sql`
      UPDATE assessment_notes
      SET notes = ${noteValue}
      WHERE assessment_id = ${assessmentId}::uuid
        AND section = ${activeSection}
      RETURNING id
    `) as Array<{ id: string }>;

    if (updatedNotes.length === 0 && noteValue !== null) {
      await sql`
        INSERT INTO assessment_notes (assessment_id, section, notes)
        VALUES (${assessmentId}::uuid, ${activeSection}, ${noteValue})
      `;
    }

    console.info("[partners.savePartnerExternalQuestionnaireSection] section note saved", {
      entitySlug,
      activeSection,
      submitIntent,
      noteLength: sectionFinalObservation.length,
      durationMs: elapsedMs(noteSaveStartedAt),
    });
  }

  if (submitIntent === "finalize_review") {
    let jiraSynced = false;

    if (allowedSections.has(activeSection) && sectionFinalObservation && jiraIssueKey) {
      try {
        const jiraStartedAt = Date.now();
        await addInternalCommentToConfiguredJiraIssue({
          issueKey: jiraIssueKey,
          entityKind: "PARTNER",
          commentBody: `${activeSection} analysis\n\n"${sectionFinalObservation}"`,
        });
        jiraSynced = true;
        console.info("[partners.savePartnerExternalQuestionnaireSection] jira sync completed", {
          entitySlug,
          activeSection,
          submitIntent,
          jiraIssueKey,
          durationMs: elapsedMs(jiraStartedAt),
        });
      } catch {
        redirect(`/partners/${entitySlug}?tab=${encodeURIComponent(activeTab)}&section=${encodeURIComponent(activeSection)}&jira_error=1`);
      }
    }

    console.info("[partners.savePartnerExternalQuestionnaireSection] finalize completed", {
      entitySlug,
      activeSection,
      submitIntent,
      responseCount: responseIds.length,
      totalDurationMs: elapsedMs(requestStartedAt),
      jiraSynced,
    });

    redirect(`/partners/${entitySlug}?tab=decision&saved=1${jiraSynced ? "&jira_synced=1" : ""}`);
  }

  if (submitIntent === "save_final_observation") {
    console.info("[partners.savePartnerExternalQuestionnaireSection] final observation saved", {
      entitySlug,
      activeSection,
      submitIntent,
      totalDurationMs: elapsedMs(requestStartedAt),
    });
    redirect(`/partners/${entitySlug}?tab=${encodeURIComponent(activeTab)}&section=${encodeURIComponent(activeSection)}&note_saved=1`);
  }

  console.info("[partners.savePartnerExternalQuestionnaireSection] section save completed", {
    entitySlug,
    activeSection,
    submitIntent,
    responseCount: responseIds.length,
    totalDurationMs: elapsedMs(requestStartedAt),
  });

  redirect(`/partners/${entitySlug}?tab=${encodeURIComponent(activeTab)}&section=${encodeURIComponent(activeSection)}&saved=1`);
}
