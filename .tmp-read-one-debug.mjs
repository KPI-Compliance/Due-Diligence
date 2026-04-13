import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const envLine = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find((line)=>line.startsWith('DATABASE_URL='));
if (envLine && !process.env.DATABASE_URL) process.env.DATABASE_URL = envLine.slice('DATABASE_URL='.length);

const sql = neon(process.env.DATABASE_URL);
const [row] = await sql.query(
  `select jira_issue_key, updated_at, contact_email, jira_form_data
   from entities
   where jira_issue_key = $1
   limit 1`,
  ['VSC-1323314'],
);
console.log(JSON.stringify({
  jira_issue_key: row?.jira_issue_key ?? null,
  updated_at: row?.updated_at ?? null,
  contact_email: row?.contact_email ?? null,
  jira_form_data: row?.jira_form_data ?? null,
}, null, 2));
