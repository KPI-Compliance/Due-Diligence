import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const envLine = fs
  .readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .find((line) => line.startsWith("DATABASE_URL="));

if (envLine && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = envLine.slice("DATABASE_URL=".length);
}

const sql = neon(process.env.DATABASE_URL);
const issueKey = process.argv[2] || "VSC-1323042";

const rows = await sql.query(
  `select jira_issue_key, company_group::text as company_group, jira_form_data->>'company' as form_company
   from entities
   where jira_issue_key = $1
   limit 1`,
  [issueKey],
);

console.log(JSON.stringify(rows, null, 2));
