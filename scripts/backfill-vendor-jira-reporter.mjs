import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

function isBlank(value) {
  return !value || String(value).trim().length === 0;
}

function toCleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

loadEnvFile(path.join(projectRoot, ".env.local"));
loadEnvFile(path.join(projectRoot, ".env"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

const sql = neon(databaseUrl);

async function getJiraConfig() {
  const rows = await sql`
    SELECT config
    FROM integration_settings
    WHERE provider = 'JIRA'
    LIMIT 1
  `;

  const config = rows[0]?.config ?? null;
  if (!config || typeof config !== "object") {
    throw new Error("JIRA integration config not found.");
  }

  const baseUrl = String(config.base_url ?? "").trim().replace(/\/$/, "");
  const email = String(config.api_email ?? process.env.JIRA_API_EMAIL ?? "").trim();
  const token = String(config.api_token ?? process.env.JIRA_API_TOKEN ?? "").trim();

  if (!baseUrl || !email || !token) {
    throw new Error("JIRA credentials are incomplete (base_url/api_email/api_token).");
  }

  return { baseUrl, email, token };
}

async function fetchReporterFromIssue(jira, issueKey) {
  const auth = `Basic ${Buffer.from(`${jira.email}:${jira.token}`).toString("base64")}`;
  const issueUrl = `${jira.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=reporter`;
  const response = await fetch(issueUrl, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Jira issue request failed (${response.status})`);
  }

  const payload = await response.json();
  const reporter = payload?.fields?.reporter ?? null;
  return {
    reporterName: toCleanString(reporter?.displayName),
    reporterEmail: toCleanString(reporter?.emailAddress)?.toLowerCase() ?? null,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const forceAll = process.argv.includes("--force-all");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Math.max(1, Number.parseInt(limitArg.slice("--limit=".length), 10)) : 2000;

  const jira = await getJiraConfig();

  const entities = forceAll
    ? await sql`
        SELECT
          id::text,
          jira_issue_key,
          jira_form_data
        FROM entities
        WHERE kind = 'VENDOR'
          AND jira_issue_key IS NOT NULL
        ORDER BY jira_synced_at DESC NULLS LAST, updated_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT
          id::text,
          jira_issue_key,
          jira_form_data
        FROM entities
        WHERE kind = 'VENDOR'
          AND jira_issue_key IS NOT NULL
          AND (
            COALESCE(NULLIF(jira_form_data->>'reporterEmail', ''), '') = ''
            OR COALESCE(NULLIF(jira_form_data->>'reporterName', ''), '') = ''
          )
        ORDER BY jira_synced_at DESC NULLS LAST, updated_at DESC
        LIMIT ${limit}
      `;

  let updated = 0;
  let noReporter = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of entities) {
    const issueKey = String(row.jira_issue_key ?? "").trim();
    if (!issueKey) {
      skipped += 1;
      continue;
    }

    try {
      const jiraFormData =
        row.jira_form_data && typeof row.jira_form_data === "object" && !Array.isArray(row.jira_form_data)
          ? row.jira_form_data
          : {};
      const existingReporterName = toCleanString(jiraFormData.reporterName);
      const existingReporterEmail = toCleanString(jiraFormData.reporterEmail);

      const fetched = await fetchReporterFromIssue(jira, issueKey);
      const nextJiraFormData = {
        ...jiraFormData,
        reporterName: existingReporterName ?? fetched.reporterName ?? null,
        reporterEmail: existingReporterEmail ?? fetched.reporterEmail ?? null,
      };

      if (isBlank(nextJiraFormData.reporterName) && isBlank(nextJiraFormData.reporterEmail)) {
        noReporter += 1;
        continue;
      }

      const shouldUpdateJiraFormData = JSON.stringify(nextJiraFormData) !== JSON.stringify(jiraFormData);
      if (!shouldUpdateJiraFormData) {
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        await sql`
          UPDATE entities
          SET
            jira_form_data = ${JSON.stringify(nextJiraFormData)}::jsonb,
            updated_at = now()
          WHERE id = ${row.id}::uuid
        `;
      }

      updated += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        `[backfill-vendor-jira-reporter] failed issue ${issueKey}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        forceAll,
        scanned: entities.length,
        updated,
        noReporter,
        skipped,
        failed,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
