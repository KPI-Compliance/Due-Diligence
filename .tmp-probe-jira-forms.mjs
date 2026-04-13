import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const envLine = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find((l)=>l.startsWith('DATABASE_URL='));
if (envLine && !process.env.DATABASE_URL) process.env.DATABASE_URL = envLine.slice('DATABASE_URL='.length);
const sql = neon(process.env.DATABASE_URL);
const [cfg] = await sql.query("select config from integration_settings where provider='JIRA' limit 1");
const c = cfg.config;
const base = String(c.base_url||'').replace(/\/$/,'');
const auth = 'Basic ' + Buffer.from(`${String(c.api_email||'')}:${String(c.api_token||'')}`).toString('base64');
const issueKey = process.argv[2] || 'VSC-1323314';

const issueRes = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=names`, {headers:{Accept:'application/json',Authorization:auth}});
const issue = await issueRes.json();
const issueId = issue.id;
const candidates = [
  `/rest/servicedeskapi/request/${encodeURIComponent(issueKey)}/form`,
  `/rest/servicedeskapi/request/${encodeURIComponent(issueId)}/form`,
  `/rest/servicedeskapi/request/${encodeURIComponent(issueKey)}/forms`,
  `/rest/servicedeskapi/request/${encodeURIComponent(issueId)}/forms`,
  `/gateway/api/jsm/forms/cloud/${issueId}`,
  `/gateway/api/jira/forms/cloud/${issueId}`,
  `/rest/api/3/issue/${encodeURIComponent(issueKey)}/properties`,
];

for (const path of candidates) {
  const url = `${base}${path}`;
  const res = await fetch(url, { headers: { Accept: 'application/json', Authorization: auth } });
  const text = await res.text();
  console.log('\n===', path, '=>', res.status);
  console.log(text.slice(0, 800));
}
