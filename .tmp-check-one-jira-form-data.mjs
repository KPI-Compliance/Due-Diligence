import { neon } from '@neondatabase/serverless'
import fs from 'node:fs'

const env = fs.readFileSync('.env.local', 'utf8')
const dbLine = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))
const sql = neon(dbLine.slice('DATABASE_URL='.length))
const issueKey = process.argv[2] || 'VSC-1323314'
const rows = await sql.query(`select jira_issue_key, contact_email, category, jira_form_data from entities where jira_issue_key = $1 limit 1`, [issueKey])
console.log(JSON.stringify(rows, null, 2))
