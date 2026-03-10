import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { extractEntityFromJiraIssue, isSupportedJiraWebhookEvent, type JiraWebhookPayload } from "@/lib/jira";

export const runtime = "nodejs";

type JiraIntegrationRow = {
  enabled: boolean;
  config: {
    base_url?: string;
  } | null;
};

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

    const payload = (await request.json()) as JiraWebhookPayload;

    if (!isSupportedJiraWebhookEvent(payload)) {
      return NextResponse.json({ ok: true, message: "Event ignored (not issue_created/issue_updated)." });
    }

    const entity = extractEntityFromJiraIssue(payload);
    if (!entity) {
      return NextResponse.json({ ok: false, message: "Missing Jira issue key or summary." }, { status: 400 });
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
        owner_user_id,
        jira_issue_key,
        jira_issue_url,
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
        ${ownerUserId}::uuid,
        ${entity.issueKey},
        ${browserIssueUrl},
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
        owner_user_id = COALESCE(EXCLUDED.owner_user_id, entities.owner_user_id),
        jira_issue_url = COALESCE(EXCLUDED.jira_issue_url, entities.jira_issue_url),
        jira_synced_at = now()
    `;

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
