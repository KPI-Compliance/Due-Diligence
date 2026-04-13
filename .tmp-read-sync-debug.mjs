import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const envLine = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((line) => line.startsWith('DATABASE_URL='));
if (envLine && !process.env.DATABASE_URL) process.env.DATABASE_URL = envLine.slice('DATABASE_URL='.length);

const sql = neon(process.env.DATABASE_URL);
const keys = ['VSC-1323314','VSC-1323310','VSC-1323313','VSC-1323311','VSC-1323306'];
const rows = await sql.query(
  `select jira_issue_key, updated_at, jira_form_data
   from entities
   where kind = 'VENDOR' and jira_issue_key = any($1)
   order by updated_at desc`,
  [keys],
);

const result = rows.map((row) => ({
  jira_issue_key: row.jira_issue_key,
  updated_at: row.updated_at,
  vendorEmail: row.jira_form_data?.vendorEmail ?? null,
  vtexResponsibleEmail: row.jira_form_data?.vtexResponsibleEmail ?? null,
  languagePreference: row.jira_form_data?.languagePreference ?? null,
  priority: row.jira_form_data?.priority ?? null,
  capNumber: row.jira_form_data?.capNumber ?? null,
  scope: row.jira_form_data?.scope ?? null,
  _syncDebug: row.jira_form_data?._syncDebug ?? null,
}));

console.log(JSON.stringify(result, null, 2));
