import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import { enrichVendorFieldsFromJiraAttachments, enrichVendorFieldsFromJiraIssue } from './lib/jira.ts';

const env = fs.readFileSync('.env.local','utf8');
const dbLine = env.split('\n').find((l)=>l.startsWith('DATABASE_URL='));
const sql = neon(dbLine.slice('DATABASE_URL='.length));
const [integration] = await sql.query(`select config from integration_settings where provider='JIRA' limit 1`);
const c = integration?.config ?? {};
const baseUrl = String(c.base_url ?? '').trim();
const email = String(c.api_email ?? '').trim();
const token = String(c.api_token ?? '').trim();
const issueKey = process.argv[2] || 'VSC-1323836';

const issue = await enrichVendorFieldsFromJiraIssue({ baseUrl, email, token, issueKey });
const attach = await enrichVendorFieldsFromJiraAttachments({ baseUrl, email, token, issueKey });

console.log(JSON.stringify({ issue, attach }, null, 2));
