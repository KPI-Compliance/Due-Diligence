import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const envLine = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find((l)=>l.startsWith('DATABASE_URL='));
if (envLine && !process.env.DATABASE_URL) process.env.DATABASE_URL = envLine.slice('DATABASE_URL='.length);
const sql = neon(process.env.DATABASE_URL);

const [cfg] = await sql.query("select config from integration_settings where provider='JIRA' limit 1");
const c = cfg.config;
const base = String(c.base_url||'').replace(/\/$/,'');
const auth = 'Basic ' + Buffer.from(`${String(c.api_email||'')}:${String(c.api_token||'')}`).toString('base64');

const keys = process.argv.slice(2);
if (keys.length === 0) {
  console.error('usage: node .tmp-backfill-vendor-from-pdf.mjs VSC-1323314 ...');
  process.exit(1);
}

function esc(v){return String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function norm(v){return String(v||'').replace(/\r/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}
function oneLine(v){return norm(v).replace(/\s+/g,' ').trim()}
function email(v){const m=String(v||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); return m?.[0]?.toLowerCase()||null}
function parseTextByLabel(text, labels, boundaries){
  const bp = boundaries.map((b)=>esc(b)).join('|');
  for (const l of labels){
    const re = new RegExp(`${esc(l)}\\s*\\*?\\s*[:|-]?\\s*([\\s\\S]{1,500}?)(?=(?:${bp})\\s*\\*?\\s*[:|-]?|$)`, 'iu');
    const m = text.match(re);
    if (m?.[1]) { const v = oneLine(m[1]); if (v) return v; }
  }
  return null;
}
function parseEmailByLabel(text, labels){
  for (const l of labels){
    const re = new RegExp(`${esc(l)}\\s*\\*?\\s*[:|-]?\\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})`, 'iu');
    const m = text.match(re);
    if (m?.[1]) return email(m[1]);
  }
  return null;
}

const boundaries = [
  'Name of Vendor','Vendor e-mail address','Vendor e-mail','Vendor email address','Vendor email',
  'VTEX e-mail responsible','VTEX email responsible','Vendor Language Preferences','Priority','CAP NUMBER','Company','Scope','Escopo','Context','Contexto'
];

for (const issueKey of keys) {
  const issueRes = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=attachment`, {headers:{Accept:'application/json',Authorization:auth}});
  const issue = await issueRes.json();
  const atts = (issue?.fields?.attachment || [])
    .filter((a)=>String(a.mimeType||'').toLowerCase()==='application/pdf' || String(a.filename||'').toLowerCase().endsWith('.pdf'))
    .sort((a,b)=>Date.parse(String(b.created||''))-Date.parse(String(a.created||'')));

  let extracted = null;
  for (const att of atts) {
    const urls = [att.content, `${base}/rest/api/3/attachment/content/${encodeURIComponent(att.id)}`].filter(Boolean);
    let resp = null;
    for (const u of urls) {
      const r = await fetch(String(u), {headers:{Accept:'*/*', Authorization:auth}});
      if (r.ok) { resp = r; break; }
    }
    if (!resp) continue;

    const buf = Buffer.from(await resp.arrayBuffer());
    const doc = await getDocument({data:new Uint8Array(buf), stopAtErrors:false, isEvalSupported:false, disableFontFace:true, verbosity:0}).promise;
    let text = '';
    for (let p=1;p<=doc.numPages;p+=1){
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((i)=>('str' in i && typeof i.str==='string') ? i.str + (('hasEOL' in i && i.hasEOL)?'\n':' ') : '').join('') + '\n';
    }
    await doc.destroy();

    const raw = norm(text);
    const single = oneLine(raw);
    const vendorEmail = parseEmailByLabel(single, ['Vendor e-mail address','Vendor e-mail','Vendor email address','Vendor email','E-mail do vendor','Email do vendor','Email do fornecedor']);
    const vtexResponsibleEmail = parseEmailByLabel(single, ['VTEX e-mail responsible','VTEX email responsible','Responsável VTEX','Responsavel VTEX','Ponto focal VTEX']);
    const languagePreference = parseTextByLabel(raw, ['Vendor Language Preferences','Language Preference','Idioma','Language'], boundaries);
    const priority = parseTextByLabel(raw, ['Priority','Prioridade'], boundaries);
    const capNumber = parseTextByLabel(raw, ['CAP NUMBER','CAP','CAP Number'], boundaries);
    const company = parseTextByLabel(raw, ['Company','Empresa','Business unit','Company group','Grupo'], boundaries);
    const scope = parseTextByLabel(raw, ['Scope','Escopo','Context','Contexto'], boundaries);

    if (vendorEmail || vtexResponsibleEmail || languagePreference || priority || capNumber || company || scope) {
      extracted = { vendorEmail, vtexResponsibleEmail, languagePreference, priority, capNumber, company, scope };
      break;
    }
  }

  if (!extracted) {
    console.log(issueKey, 'NO_EXTRACT');
    continue;
  }

  const [entity] = await sql.query('select id::text, jira_form_data, contact_email from entities where jira_issue_key = $1 limit 1', [issueKey]);
  if (!entity?.id) {
    console.log(issueKey, 'ENTITY_NOT_FOUND');
    continue;
  }

  const prev = entity.jira_form_data && typeof entity.jira_form_data === 'object' ? entity.jira_form_data : {};
  const next = {
    ...prev,
    vendorEmail: extracted.vendorEmail ?? prev.vendorEmail ?? null,
    vtexResponsibleEmail: extracted.vtexResponsibleEmail ?? prev.vtexResponsibleEmail ?? null,
    languagePreference: extracted.languagePreference ?? prev.languagePreference ?? null,
    priority: extracted.priority ?? prev.priority ?? null,
    capNumber: extracted.capNumber ?? prev.capNumber ?? null,
    company: extracted.company ?? prev.company ?? null,
    scope: extracted.scope ?? prev.scope ?? null,
    _manualBackfillAt: new Date().toISOString(),
  };

  await sql.query(
    'update entities set contact_email = coalesce($1, contact_email), description = coalesce($2, description), jira_form_data = $3::jsonb, updated_at = now() where id = $4::uuid',
    [extracted.vendorEmail ?? null, extracted.scope ?? null, JSON.stringify(next), entity.id],
  );

  console.log(issueKey, 'UPDATED', extracted);
}
