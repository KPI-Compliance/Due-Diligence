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
import { syncExternalQuestionnaireForEntity } from "@/lib/typeform-sync";
import { ensureVendorQuestionnaireSelection } from "@/lib/vendor-external-questionnaire";
import { recalculateVendorAssessmentDecisionByAssessmentId } from "@/lib/vendor-risk-scoring";

const allowedAnalystEvaluations = new Set(["NOT_EVALUATED", "NA", "DOES_NOT_MEET", "PARTIALLY", "FULLY"]);

export async function saveVendorExternalQuestionnaire(formData: FormData) {
  const sessionResult = await refreshServerActionSession("vendors.saveVendorExternalQuestionnaire");
  if (!sessionResult.session) {
    redirect(`/?error=${encodeURIComponent(getSessionErrorCode(sessionResult.reason))}`);
  }
  const access = await resolveUserAccess(sessionResult.session.email);
  if (!access.permissions.canWriteVendors) {
    redirect("/dashboard");
  }

  const entitySlug = String(formData.get("entity_slug") ?? "").trim();
  const assessmentId = String(formData.get("assessment_id") ?? "").trim();
  const selectedFormId = String(formData.get("typeform_form_id") ?? "").trim();

  if (!entitySlug || !assessmentId || !selectedFormId) {
    throw new Error("Invalid vendor questionnaire payload.");
  }

  await ensureVendorQuestionnaireSelection({
    assessmentId,
    entitySlug,
    selectedFormId,
  });

  redirect(`/vendors/${entitySlug}?tab=overview&questionnaire=saved`);
}

export async function saveVendorExternalQuestionnaireSection(formData: FormData) {
  const sessionResult = await refreshServerActionSession("vendors.saveVendorExternalQuestionnaireSection");
  if (!sessionResult.session) {
    redirect(`/?error=${encodeURIComponent(getSessionErrorCode(sessionResult.reason))}`);
  }
  const access = await resolveUserAccess(sessionResult.session.email);
  if (!access.permissions.canWriteVendors) {
    redirect("/dashboard");
  }

  const entitySlug = String(formData.get("entity_slug") ?? "").trim();
  const assessmentId = String(formData.get("assessment_id") ?? "").trim();
  const activeTab = String(formData.get("active_tab") ?? "external_questionnaire").trim() || "external_questionnaire";
  const activeSection = String(formData.get("active_section") ?? "Common").trim() || "Common";
  const responseIds = formData.getAll("response_id").map((value) => String(value).trim()).filter(Boolean);

  if (!entitySlug || !assessmentId) {
    throw new Error("Invalid vendor questionnaire section payload.");
  }

  const analystUserRows = (await sql`
    SELECT id::text
    FROM users
    WHERE lower(email) = lower(${sessionResult.session.email})
    LIMIT 1
  `) as Array<{ id: string }>;
  const analystUserId = analystUserRows[0]?.id ?? null;

  let updatedRows = 0;
  let supportsExtendedColumns = true;

  for (const responseId of responseIds) {
    const evaluationRaw = String(formData.get(`evaluation_${responseId}`) ?? "NOT_EVALUATED").trim().toUpperCase();
    const analystEvaluation = allowedAnalystEvaluations.has(evaluationRaw) ? evaluationRaw : "NOT_EVALUATED";
    const analystObservations = String(formData.get(`observations_${responseId}`) ?? "").trim();
    const reviewStatus = analystEvaluation === "FULLY" || analystEvaluation === "NA" ? "COMPLIANT" : "NEEDS_REVIEW";

    if (supportsExtendedColumns) {
      try {
        const result = (await sql`
          UPDATE assessment_question_responses
          SET
            review_status = ${reviewStatus}::review_status,
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
            END,
            updated_at = now()
          WHERE id = ${responseId}::uuid
            AND assessment_id = ${assessmentId}::uuid
          RETURNING id
        `) as Array<{ id: string }>;
        updatedRows += result.length;
        continue;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== "42703" && code !== "42704") {
          throw error;
        }
        supportsExtendedColumns = false;
      }
    }

    const fallbackResult = (await sql`
      UPDATE assessment_question_responses
      SET
        review_status = ${reviewStatus}::review_status,
        updated_at = now()
      WHERE id = ${responseId}::uuid
        AND assessment_id = ${assessmentId}::uuid
      RETURNING id
    `) as Array<{ id: string }>;
    updatedRows += fallbackResult.length;
  }

  if (responseIds.length > 0 && updatedRows === 0) {
    throw new Error("No vendor questionnaire responses were updated.");
  }

  await recalculateVendorAssessmentDecisionByAssessmentId(assessmentId);

  redirect(`/vendors/${entitySlug}?tab=${encodeURIComponent(activeTab)}&section=${encodeURIComponent(activeSection)}&saved=1`);
}

export async function refreshVendorExternalQuestionnaire(formData: FormData) {
  const sessionResult = await refreshServerActionSession("vendors.refreshVendorExternalQuestionnaire");
  if (!sessionResult.session) {
    redirect(`/?error=${encodeURIComponent(getSessionErrorCode(sessionResult.reason))}`);
  }
  const access = await resolveUserAccess(sessionResult.session.email);
  if (!access.permissions.canWriteVendors) {
    redirect("/dashboard");
  }

  const entitySlug = String(formData.get("entity_slug") ?? "").trim();
  if (!entitySlug) {
    throw new Error("Invalid vendor refresh payload.");
  }

  const entityRows = (await sql`
    SELECT id::text, name, jira_issue_key
    FROM entities
    WHERE slug = ${entitySlug}
      AND kind = 'VENDOR'
    LIMIT 1
  `) as Array<{ id: string; name: string; jira_issue_key: string | null }>;

  const entity = entityRows[0];
  if (!entity) {
    redirect(`/vendors/${entitySlug}?tab=external_questionnaire&sync_error=not_found`);
  }

  const assessmentRows = (await sql`
    SELECT typeform_form_id
    FROM assessments
    WHERE entity_id = ${entity.id}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `) as Array<{ typeform_form_id: string | null }>;

  let result: Awaited<ReturnType<typeof syncExternalQuestionnaireForEntity>>;
  try {
    result = await syncExternalQuestionnaireForEntity({
      entityId: entity.id,
      entityName: entity.name,
      entityKind: "VENDOR",
      jiraIssueKey: entity.jira_issue_key,
      formId: assessmentRows[0]?.typeform_form_id ?? null,
    });
  } catch {
    redirect(`/vendors/${entitySlug}?tab=external_questionnaire&sync_error=1`);
  }

  if (result.status === "no_match") {
    redirect(`/vendors/${entitySlug}?tab=external_questionnaire&sync_empty=1`);
  }

  if (result.status !== "updated" && result.status !== "already_linked") {
    redirect(`/vendors/${entitySlug}?tab=external_questionnaire&sync_error=1`);
  }

  redirect(`/vendors/${entitySlug}?tab=external_questionnaire&sync_forced=1`);
}

const allowedDecisionOptions = new Set(["APPROVED", "APPROVED_WITH_RESTRICTIONS", "REJECTED"]);
const allowedWorkflowStatuses = new Set(["Opened", "Waiting vendor", "Received Quest.", "Red Team", "Concluido"]);
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

export async function saveVendorAssessmentDecision(formData: FormData) {
  const sessionResult = await refreshServerActionSession("vendors.saveVendorAssessmentDecision");
  if (!sessionResult.session) {
    redirect(`/?error=${encodeURIComponent(getSessionErrorCode(sessionResult.reason))}`);
  }
  const access = await resolveUserAccess(sessionResult.session.email);
  if (!access.permissions.canWriteVendors) {
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
    throw new Error("Invalid vendor decision payload.");
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
      redirect(`/vendors/${entitySlug}?tab=decision&status_guard=1`);
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
  } else if (effectiveWorkflowStatus === "Waiting vendor") {
    await sql`
      UPDATE assessments
      SET
        status = 'SENT',
        sent_at = COALESCE(sent_at, now()),
        completed_at = NULL,
        updated_at = now()
      WHERE id = ${assessmentId}::uuid
    `;
    await sql`
      UPDATE entities e
      SET
        status = 'SENT',
        status_label = 'Waiting vendor',
        updated_at = now()
      FROM assessments a
      WHERE a.id = ${assessmentId}::uuid
        AND a.entity_id = e.id
    `;
  } else if (effectiveWorkflowStatus === "Received Quest.") {
    await sql`
      UPDATE assessments
      SET
        status = 'RESPONDED',
        responded_at = COALESCE(responded_at, now()),
        completed_at = NULL,
        updated_at = now()
      WHERE id = ${assessmentId}::uuid
    `;
    await sql`
      UPDATE entities e
      SET
        status = 'RESPONDED',
        status_label = 'Received Quest.',
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
        entityKind: "VENDOR",
        classification: manualClassificationRaw,
      });
    } catch {
      redirect(`/vendors/${entitySlug}?tab=decision&saved=1&jira_error=1`);
    }

    if (effectiveWorkflowStatus && effectiveWorkflowStatus !== "Received Quest.") {
      try {
        await updateConfiguredJiraIssueWorkflowStatus({
          issueKey: jiraIssueKey,
          entityKind: "VENDOR",
          workflowStatusLabel: effectiveWorkflowStatus,
        });
      } catch (error) {
        console.warn("[vendors.saveVendorAssessmentDecision] jira workflow status sync skipped", {
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
          entityKind: "VENDOR",
          commentBody: `Final approved decision\n\nInternal observation:\n"${approvedFinalObservation}"`,
        });
        jiraSynced = true;
      } catch {
        redirect(`/vendors/${entitySlug}?tab=decision&saved=1&jira_error=1`);
      }
    }

    redirect(`/vendors/${entitySlug}?tab=decision&saved=1${jiraSynced ? "&jira_synced=1" : ""}`);
  }

  if (reopenDecision) {
    redirect(`/vendors/${entitySlug}?tab=decision&saved=1`);
  }

  redirect(`/vendors/${entitySlug}?tab=decision&saved=1`);
}
