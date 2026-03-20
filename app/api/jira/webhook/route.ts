import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  extractEntityFromJiraIssue,
  fetchJiraIssueCreatedAt,
  isSupportedJiraWebhookEvent,
  resolveKindFromJiraQueues,
  type JiraWebhookPayload,
} from "@/lib/jira";
import type { JiraConfig } from "@/lib/settings-data";

export const runtime = "nodejs";

type JiraIntegrationRow = {
  enabled: boolean;
  config: JiraConfig | null;
};

function resolveExplicitEntityKind(payload: JiraWebhookPayload): "VENDOR" | "PARTNER" | null {
  const candidates = [
    payload["entity-kind"],
    payload["entity_kind"],
    payload["entity kind"],
    payload.kind,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate ?? "").trim().toUpperCase();
    if (normalized === "VENDOR" || normalized === "PARTNER") {
      return normalized;
    }
  }

  return null;
}

function escapeControlCharactersInJsonStrings(raw: string) {
  let result = "";
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (isEscaped) {
        result += char;
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        result += char;
        isEscaped = true;
        continue;
      }

      if (char === "\"") {
        result += char;
        inString = false;
        continue;
      }

      const code = char.charCodeAt(0);
      if (code <= 0x1f) {
        if (char === "\n") result += "\\n";
        else if (char === "\r") result += "\\r";
        else if (char === "\t") result += "\\t";
        else result += `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
    } else if (char === "\"") {
      inString = true;
    }

    result += char;
  }

  return result;
}

async function parseJiraWebhookPayload(request: Request) {
  const rawBody = await request.text();

  try {
    return JSON.parse(rawBody) as JiraWebhookPayload;
  } catch (originalError) {
    const sanitizedBody = escapeControlCharactersInJsonStrings(rawBody);

    try {
      return JSON.parse(sanitizedBody) as JiraWebhookPayload;
    } catch {
      const message = originalError instanceof Error ? originalError.message : "Invalid JSON payload.";

      throw new Error(
        `${message} Make sure Jira smart values use .asJsonString for string fields in the custom data payload.`,
      );
    }
  }
}

function secretMatches(headerValue: string | null, configuredSecret: string) {
  if (!headerValue) return false;

  const received = Buffer.from(headerValue);
  const expected = Buffer.from(configuredSecret);

  if (received.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  try {
    let jiraSetting: JiraIntegrationRow = { enabled: true, config: null };

    try {
      const rows = (await sql`
        SELECT enabled, config
        FROM integration_settings
        WHERE provider = 'JIRA'
        LIMIT 1
      `) as JiraIntegrationRow[];

      if (rows.length > 0) {
        jiraSetting = rows[0];
      }
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "42P01") {
        throw error;
      }
    }

    if (!jiraSetting.enabled) {
      return NextResponse.json({ ok: true, message: "Jira integration disabled. Event ignored." });
    }

    const configuredSecret = process.env.JIRA_WEBHOOK_SECRET;
    if (configuredSecret && !secretMatches(request.headers.get("x-jira-webhook-secret"), configuredSecret)) {
      return NextResponse.json({ ok: false, message: "Invalid Jira webhook secret." }, { status: 401 });
    }

    const payload = await parseJiraWebhookPayload(request);
    const explicitKind = resolveExplicitEntityKind(payload);

    if (!isSupportedJiraWebhookEvent(payload)) {
      return NextResponse.json({ ok: true, message: "Event ignored (not issue_created/issue_updated)." });
    }

    const jiraApiEmail = jiraSetting.config?.api_email || process.env.JIRA_API_EMAIL || "";
    const jiraApiToken = jiraSetting.config?.api_token || process.env.JIRA_API_TOKEN || "";
    let resolvedKind: "VENDOR" | "PARTNER" | null = null;
    const queueResolutionConfigured = Boolean(
      jiraSetting.config?.base_url &&
        jiraApiEmail &&
        jiraApiToken &&
        (jiraSetting.config?.vendors.queue_url || jiraSetting.config?.partners.queue_url),
    );

    if (queueResolutionConfigured && jiraSetting.config?.base_url) {
      try {
        resolvedKind = await resolveKindFromJiraQueues({
          baseUrl: jiraSetting.config.base_url,
          email: jiraApiEmail,
          token: jiraApiToken,
          issueId: payload.issue?.id,
          vendorsProjectKey: jiraSetting.config.vendors.project_key,
          vendorsQueueUrl: jiraSetting.config.vendors.queue_url,
          partnersProjectKey: jiraSetting.config.partners.project_key,
          partnersQueueUrl: jiraSetting.config.partners.queue_url,
        });
      } catch (error) {
        console.warn("Jira queue kind resolution failed:", error instanceof Error ? error.message : String(error));
      }
    }

    if (!resolvedKind && explicitKind) {
      resolvedKind = explicitKind;
    }

    if (queueResolutionConfigured && !resolvedKind) {
      return NextResponse.json({
        ok: true,
        message: "Issue ignored because it does not belong to any configured Jira queue.",
        issue_key: payload.issue?.key ?? null,
      });
    }

    const entity = extractEntityFromJiraIssue(payload, resolvedKind);
    if (!entity) {
      return NextResponse.json({ ok: false, message: "Missing Jira issue key or summary." }, { status: 400 });
    }

    let jiraIssueCreatedAt: string | null = null;
    if (jiraSetting.config?.base_url && jiraApiEmail && jiraApiToken) {
      try {
        jiraIssueCreatedAt = await fetchJiraIssueCreatedAt({
          baseUrl: jiraSetting.config.base_url,
          email: jiraApiEmail,
          token: jiraApiToken,
          issueKey: entity.issueKey,
        });
      } catch (error) {
        console.warn("Jira issue created_at fetch failed:", error instanceof Error ? error.message : String(error));
      }
    }

    const browserIssueUrl = jiraSetting.config?.base_url
      ? `${jiraSetting.config.base_url.replace(/\/$/, "")}/browse/${entity.issueKey}`
      : entity.issueUrl;

    const ownerRows = entity.ownerEmail
      ? ((await sql`
          SELECT id::text
          FROM users
          WHERE lower(email) = lower(${entity.ownerEmail})
          LIMIT 1
        `) as Array<{ id: string }>)
      : [];

    const ownerUserId = ownerRows[0]?.id ?? null;

    const existingRows = (await sql`
      SELECT id::text, slug
      FROM entities
      WHERE jira_issue_key = ${entity.issueKey}
      LIMIT 1
    `) as Array<{ id: string; slug: string }>;

    const currentSlug = existingRows[0]?.slug ?? null;
    const persistedJiraFormData = {
      ...entity.jiraFormData,
      jiraStatus: payload.issue?.fields?.status?.name?.trim() || null,
      jiraIssueCreatedAt,
    };

    await sql`
      INSERT INTO entities (
        slug,
        name,
        kind,
        company_group,
        domain,
        segment,
        category,
        website,
        contact_email,
        description,
        subtitle,
        status_label,
        status,
        risk_level,
        jira_form_data,
        owner_user_id,
        jira_issue_key,
        jira_issue_url,
        jira_issue_created_at,
        jira_synced_at
      )
      VALUES (
        ${currentSlug ?? entity.slug},
        ${entity.name},
        ${entity.kind}::entity_kind,
        ${entity.companyGroup}::company_group,
        ${entity.domain},
        ${entity.segment},
        ${entity.category},
        ${entity.website},
        ${entity.contactEmail},
        ${entity.description},
        ${entity.subtitle},
        ${entity.statusLabel},
        ${entity.status}::assessment_status,
        ${entity.riskLevel}::risk_level,
        ${JSON.stringify(persistedJiraFormData)}::jsonb,
        ${ownerUserId}::uuid,
        ${entity.issueKey},
        ${browserIssueUrl},
        ${jiraIssueCreatedAt ? new Date(jiraIssueCreatedAt) : null},
        now()
      )
      ON CONFLICT (jira_issue_key)
      DO UPDATE SET
        name = EXCLUDED.name,
        kind = EXCLUDED.kind,
        company_group = EXCLUDED.company_group,
        domain = COALESCE(EXCLUDED.domain, entities.domain),
        segment = COALESCE(EXCLUDED.segment, entities.segment),
        category = COALESCE(EXCLUDED.category, entities.category),
        website = COALESCE(EXCLUDED.website, entities.website),
        contact_email = COALESCE(EXCLUDED.contact_email, entities.contact_email),
        description = COALESCE(EXCLUDED.description, entities.description),
        subtitle = COALESCE(EXCLUDED.subtitle, entities.subtitle),
        status_label = COALESCE(EXCLUDED.status_label, entities.status_label),
        status = EXCLUDED.status,
        risk_level = EXCLUDED.risk_level,
        jira_form_data = COALESCE(entities.jira_form_data, '{}'::jsonb) || COALESCE(EXCLUDED.jira_form_data, '{}'::jsonb),
        owner_user_id = COALESCE(EXCLUDED.owner_user_id, entities.owner_user_id),
        jira_issue_url = COALESCE(EXCLUDED.jira_issue_url, entities.jira_issue_url),
        jira_issue_created_at = COALESCE(EXCLUDED.jira_issue_created_at, entities.jira_issue_created_at),
        jira_synced_at = now()
    `;

    const syncedEntityRows = (await sql`
      SELECT id::text, name
      FROM entities
      WHERE jira_issue_key = ${entity.issueKey}
      LIMIT 1
    `) as Array<{ id: string; name: string }>;

    const syncedEntity = syncedEntityRows[0];
    if (syncedEntity) {
      const assessmentRows = (await sql`
        SELECT id::text
        FROM assessments
        WHERE entity_id = ${syncedEntity.id}::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `) as Array<{ id: string }>;

      if (assessmentRows.length === 0) {
        await sql`
          INSERT INTO assessments (entity_id, title, status)
          VALUES (
            ${syncedEntity.id}::uuid,
            ${`${entity.kind === "PARTNER" ? "Partner" : "Vendor"} Assessment - ${syncedEntity.name}`},
            'PENDING'
          )
        `;
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Jira issue synchronized successfully.",
      issue_key: entity.issueKey,
      entity_slug: currentSlug ?? entity.slug,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Jira webhook error.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
