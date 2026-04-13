import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local','utf8');
const dbLine = env.split(/\r?\n/).find((l)=>l.startsWith('DATABASE_URL='));
if (dbLine && !process.env.DATABASE_URL) process.env.DATABASE_URL = dbLine.slice('DATABASE_URL='.length);
const sql = neon(process.env.DATABASE_URL);
const [cfg] = await sql.query("select config from integration_settings where provider='JIRA' limit 1");
const c = cfg.config;
const base = String(c.base_url||'').replace(/\/$/,'');
const auth = 'Basic ' + Buffer.from(`${String(c.api_email||'')}:${String(c.api_token||'')}`).toString('base64');
const issueKey = process.argv[2] || 'VSC-1323836';

const res = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=names`, {headers:{Accept:'application/json',Authorization:auth}});
const issue = await res.json();
const fields = issue.fields || {};
const names = issue.names || {};

const out = [];
for (const [k,v] of Object.entries(fields)) {
  if (v === null || v === undefined) continue;
  const s = JSON.stringify(v);
  if (!s || s === '""' || s === '[]' || s === '{}') continue;
  const name = names[k] || k;
  const lname = String(name).toLowerCase();
  if (/vendor|fornecedor|email|scope|escopo|company|empresa|cap|idioma|language|priority|prioridade|request/.test(lname)) {
    out.push({k,name,v});
  }
}
console.log(JSON.stringify(out,null,2));
