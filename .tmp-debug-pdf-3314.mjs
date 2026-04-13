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

const issueKey = 'VSC-1323314';
const issueRes = await fetch(`${base}/rest/api/3/issue/${issueKey}?fields=attachment`, {headers:{Accept:'application/json',Authorization:auth}});
const issue = await issueRes.json();
const atts = (issue?.fields?.attachment || []).filter((a)=>String(a.mimeType||'').toLowerCase()==='application/pdf' || String(a.filename||'').toLowerCase().endsWith('.pdf'));
atts.sort((a,b)=>Date.parse(String(b.created||''))-Date.parse(String(a.created||'')));
console.log('attachments', atts.map((a)=>({id:a.id, filename:a.filename, created:a.created, content:a.content})));
if (!atts[0]) process.exit(0);
const pdfRes = await fetch(atts[0].content, {headers:{Accept:'application/pdf', Authorization:auth}});
console.log('pdf status', pdfRes.status);
const buf = Buffer.from(await pdfRes.arrayBuffer());
const doc = await getDocument({data:new Uint8Array(buf), stopAtErrors:false, isEvalSupported:false, disableFontFace:true, verbosity:0}).promise;
let txt='';
for (let p=1;p<=doc.numPages;p+=1){
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  txt += content.items.map((i)=>('str' in i && typeof i.str==='string') ? i.str + (('hasEOL' in i && i.hasEOL)?'\n':' ') : '').join('') + '\n';
}
await doc.destroy();
console.log('---TEXT---');
console.log(txt);
