import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
const envLine = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find((l)=>l.startsWith('DATABASE_URL='));
if (envLine && !process.env.DATABASE_URL) process.env.DATABASE_URL = envLine.slice('DATABASE_URL='.length);
const sql = neon(process.env.DATABASE_URL);
const [cfg] = await sql.query("select config from integration_settings where provider='JIRA' limit 1");
const c = cfg.config;
const base = String(c.base_url||'').replace(/\/$/,'');
const auth = 'Basic ' + Buffer.from(`${String(c.api_email||'')}:${String(c.api_token||'')}`).toString('base64');
const issue='VSC-1323314';
const keysRes = await fetch(`${base}/rest/api/3/issue/${issue}/properties`, {headers:{Accept:'application/json', Authorization:auth}});
const keys = await keysRes.json();
console.log(keys);
for (const k of keys.keys || []) {
  const r = await fetch(`${base}/rest/api/3/issue/${issue}/properties/${encodeURIComponent(k.key)}`, {headers:{Accept:'application/json', Authorization:auth}});
  const t = await r.text();
  console.log('\nPROP', k.key, r.status, t.slice(0,1500));
}
