import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

loadEnvFile(path.join(projectRoot, ".env.local"));
loadEnvFile(path.join(projectRoot, ".env"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

const sql = neon(databaseUrl);

function normalizeComparable(value) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function answerToText(answer) {
  if (typeof answer?.text === "string") return answer.text;
  if (typeof answer?.email === "string") return answer.email;
  if (typeof answer?.number === "number") return String(answer.number);
  if (typeof answer?.boolean === "boolean") return answer.boolean ? "true" : "false";
  if (typeof answer?.date === "string") return answer.date;
  if (typeof answer?.url === "string") return answer.url;
  if (typeof answer?.file_url === "string") return answer.file_url;
  if (typeof answer?.phone_number === "string") return answer.phone_number;
  if (answer?.choice?.label) return answer.choice.label;
  if (answer?.choices?.labels?.length) return answer.choices.labels.join(", ");
  return "";
}

function flattenFieldDefinitions(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return [];
  return fields.flatMap((field) => [field, ...flattenFieldDefinitions(field?.properties?.fields)]);
}

function applyTypeformFieldDefinitions(answers, fields) {
  if (!Array.isArray(answers) || answers.length === 0 || !Array.isArray(fields) || fields.length === 0) return answers ?? [];
  const flatFields = flattenFieldDefinitions(fields);

  return answers.map((answer) => {
    const ref = answer?.field?.ref;
    const id = answer?.field?.id;
    const definition =
      flatFields.find((field) => ref && field?.ref === ref) ??
      flatFields.find((field) => id && field?.id === id) ??
      null;

    if (!definition?.title) return answer;

    return {
      ...answer,
      field: {
        ...answer.field,
        id: answer?.field?.id ?? definition.id,
        ref: answer?.field?.ref ?? definition.ref,
        title: answer?.field?.title ?? definition.title,
        type: answer?.field?.type ?? definition.type,
      },
    };
  });
}

function sortTypeformAnswersByFieldDefinitions(answers, fields) {
  if (!Array.isArray(answers) || answers.length === 0 || !Array.isArray(fields) || fields.length === 0) return answers ?? [];
  const flatFields = flattenFieldDefinitions(fields);
  const orderMap = new Map();
  flatFields.forEach((field, index) => {
    if (field?.ref) orderMap.set(`ref:${field.ref}`, index);
    if (field?.id) orderMap.set(`id:${field.id}`, index);
  });

  return [...answers].sort((a, b) => {
    const aOrder =
      (a?.field?.ref ? orderMap.get(`ref:${a.field.ref}`) : undefined) ??
      (a?.field?.id ? orderMap.get(`id:${a.field.id}`) : undefined) ??
      Number.MAX_SAFE_INTEGER;
    const bOrder =
      (b?.field?.ref ? orderMap.get(`ref:${b.field.ref}`) : undefined) ??
      (b?.field?.id ? orderMap.get(`id:${b.field.id}`) : undefined) ??
      Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
}

function normalizeTypeformAnswers(answers) {
  if (!Array.isArray(answers) || answers.length === 0) return [];

  return answers.map((answer, index) => ({
    domain: answer?.field?.type ?? answer?.type ?? "typeform",
    question: answer?.field?.title ?? answer?.field?.ref ?? `Question ${index + 1}`,
    questionRef: answer?.field?.ref ?? answer?.field?.id ?? "",
    value: answerToText(answer),
    raw: answer,
  }));
}

const companyQuestionCandidates = [
  "hi! what is the company name?",
  "what's the company name?",
  "whats the company name?",
  "what is the company name?",
  "ola! qual e o nome da empresa?",
  "olá! qual é o nome da empresa?",
  "qual e o nome da empresa?",
  "qual é o nome da empresa?",
  "company name",
  "nome da empresa",
];

function findAnswerByQuestionCandidates(answers, candidates) {
  if (!Array.isArray(answers) || answers.length === 0) return null;

  const normalizedCandidates = candidates.map(normalizeComparable);
  for (const answer of answers) {
    const fieldTitle = normalizeComparable(answer?.field?.title);
    const fieldRef = normalizeComparable(answer?.field?.ref);
    const matches = normalizedCandidates.some(
      (candidate) =>
        fieldTitle === candidate ||
        fieldRef === candidate ||
        fieldTitle.includes(candidate) ||
        fieldRef.includes(candidate),
    );
    if (!matches) continue;
    const value = answerToText(answer).trim();
    if (value) return value;
  }

  return null;
}

function extractCompanyNameFromTypeformAnswers(answers) {
  return findAnswerByQuestionCandidates(answers, companyQuestionCandidates);
}

function extractRespondentEmail(answers) {
  if (!Array.isArray(answers)) return null;
  for (const answer of answers) {
    if (typeof answer?.email === "string" && answer.email.trim()) {
      return answer.email.trim();
    }
  }
  return null;
}

function normalizeFormName(value) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolvePartnerQuestionnaireTable(formName) {
  const normalized = normalizeFormName(formName);
  if (!normalized) return null;

  switch (normalized) {
    case "vtex partner assessment ptbr":
      return "partner_typeform_assessment_ptbr_responses";
    case "vtex partner assessment en":
      return "partner_typeform_assessment_en_responses";
    case "vtex partner assessment pt (v2)":
      return "partner_typeform_assessment_pt_v2_responses";
    case "vtex partner assessment en (v2)":
      return "partner_typeform_assessment_en_v2_responses";
    default:
      return null;
  }
}

function resolveSectionsFromRules(answers, sectionRules) {
  const sections = answers.map(() => "UNCLASSIFIED");
  if (!sectionRules || typeof sectionRules !== "object") return sections;

  const normalizedQuestions = answers.map((answer) => normalizeComparable(answer.question));
  const definitions = [
    { key: "compliance", value: "COMPLIANCE" },
    { key: "privacy", value: "PRIVACY" },
    { key: "security", value: "SECURITY" },
  ];

  for (const definition of definitions) {
    const rules = sectionRules?.[definition.key];
    const start = normalizeComparable(rules?.start);
    const end = normalizeComparable(rules?.end);
    if (!start || !end) continue;
    const startIndex = normalizedQuestions.findIndex((question) => question === start);
    const endIndex = normalizedQuestions.findIndex((question) => question === end);
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) continue;
    for (let index = startIndex; index <= endIndex; index += 1) {
      sections[index] = definition.value;
    }
  }

  return sections;
}

function resolveSectionsFromMappings(answers, mappings) {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return answers.map(() => "UNCLASSIFIED");
  }

  return answers.map((answer, index) => {
    const byRef = mappings.find((item) => item.question_ref && item.question_ref === answer.questionRef);
    const byOrder = mappings.find((item) => item.question_order === index + 1);
    const byText = mappings.find((item) => normalizeComparable(item.question_text) === normalizeComparable(answer.question));
    const matched = byRef ?? byOrder ?? byText;
    return matched?.section ?? "UNCLASSIFIED";
  });
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function getTypeformApiToken() {
  const rows = await sql`
    SELECT config
    FROM integration_settings
    WHERE provider = 'TYPEFORM'
    LIMIT 1
  `;

  const config = rows[0]?.config ?? null;
  const dbToken =
    config && typeof config === "object" && typeof config.api_token === "string"
      ? config.api_token.trim()
      : "";

  return dbToken || process.env.TYPEFORM_API_TOKEN || process.env.TYPEFORM_ACCESS_TOKEN || null;
}

async function getTypeformFormFields(formId, token) {
  const payload = await fetchJson(`https://api.typeform.com/forms/${formId}`, token);
  return payload?.fields ?? [];
}

async function fetchAllResponsesSince(formId, token, fromIso) {
  const items = [];
  let beforeToken = null;

  while (true) {
    const url = new URL(`https://api.typeform.com/forms/${formId}/responses`);
    url.searchParams.set("page_size", "1000");
    url.searchParams.set("since", fromIso);
    if (beforeToken) {
      url.searchParams.set("before", beforeToken);
    }

    const payload = await fetchJson(url.toString(), token);
    const pageItems = Array.isArray(payload?.items) ? payload.items : [];
    items.push(...pageItems);

    if (pageItems.length < 1000) {
      break;
    }

    const lastItem = pageItems[pageItems.length - 1];
    if (!lastItem?.token || lastItem.token === beforeToken) {
      break;
    }

    beforeToken = lastItem.token;
  }

  return items;
}

async function deleteRowsByToken(tableName, responseToken) {
  if (tableName === "partner_typeform_assessment_en_responses") {
    await sql`DELETE FROM partner_typeform_assessment_en_responses WHERE typeform_response_token = ${responseToken}`;
    return;
  }
  if (tableName === "partner_typeform_assessment_ptbr_responses") {
    await sql`DELETE FROM partner_typeform_assessment_ptbr_responses WHERE typeform_response_token = ${responseToken}`;
    return;
  }
  if (tableName === "partner_typeform_assessment_en_v2_responses") {
    await sql`DELETE FROM partner_typeform_assessment_en_v2_responses WHERE typeform_response_token = ${responseToken}`;
    return;
  }
  await sql`DELETE FROM partner_typeform_assessment_pt_v2_responses WHERE typeform_response_token = ${responseToken}`;
}

async function insertRow(tableName, row) {
  const rawAnswer = JSON.stringify(row.raw_answer);

  const values = [
    row.entity_id,
    row.assessment_id,
    row.jira_issue_key,
    row.typeform_form_id,
    row.typeform_response_token,
    row.response_submitted_at,
    row.respondent_email,
    row.company_name,
    row.question_order,
    row.question_key,
    row.question_text,
    row.answer_text,
    row.section,
    rawAnswer,
  ];

  if (tableName === "partner_typeform_assessment_en_responses") {
    await sql`
      INSERT INTO partner_typeform_assessment_en_responses (
        entity_id, assessment_id, jira_issue_key, typeform_form_id, typeform_response_token, response_submitted_at,
        respondent_email, company_name, question_order, question_key, question_text, answer_text, section, raw_answer
      ) VALUES (
        ${values[0]}::uuid, ${values[1]}::uuid, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}::timestamptz,
        ${values[6]}, ${values[7]}, ${values[8]}, ${values[9]}, ${values[10]}, ${values[11]}, ${values[12]}::partner_questionnaire_section, ${values[13]}::jsonb
      )
    `;
    return;
  }

  if (tableName === "partner_typeform_assessment_ptbr_responses") {
    await sql`
      INSERT INTO partner_typeform_assessment_ptbr_responses (
        entity_id, assessment_id, jira_issue_key, typeform_form_id, typeform_response_token, response_submitted_at,
        respondent_email, company_name, question_order, question_key, question_text, answer_text, section, raw_answer
      ) VALUES (
        ${values[0]}::uuid, ${values[1]}::uuid, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}::timestamptz,
        ${values[6]}, ${values[7]}, ${values[8]}, ${values[9]}, ${values[10]}, ${values[11]}, ${values[12]}::partner_questionnaire_section, ${values[13]}::jsonb
      )
    `;
    return;
  }

  if (tableName === "partner_typeform_assessment_en_v2_responses") {
    await sql`
      INSERT INTO partner_typeform_assessment_en_v2_responses (
        entity_id, assessment_id, jira_issue_key, typeform_form_id, typeform_response_token, response_submitted_at,
        respondent_email, company_name, question_order, question_key, question_text, answer_text, section, raw_answer
      ) VALUES (
        ${values[0]}::uuid, ${values[1]}::uuid, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}::timestamptz,
        ${values[6]}, ${values[7]}, ${values[8]}, ${values[9]}, ${values[10]}, ${values[11]}, ${values[12]}::partner_questionnaire_section, ${values[13]}::jsonb
      )
    `;
    return;
  }

  await sql`
    INSERT INTO partner_typeform_assessment_pt_v2_responses (
      entity_id, assessment_id, jira_issue_key, typeform_form_id, typeform_response_token, response_submitted_at,
      respondent_email, company_name, question_order, question_key, question_text, answer_text, section, raw_answer
    ) VALUES (
      ${values[0]}::uuid, ${values[1]}::uuid, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}::timestamptz,
      ${values[6]}, ${values[7]}, ${values[8]}, ${values[9]}, ${values[10]}, ${values[11]}, ${values[12]}::partner_questionnaire_section, ${values[13]}::jsonb
    )
  `;
}

async function main() {
  const fromArg = process.argv.find((arg) => arg.startsWith("--from="));
  const fromDate = fromArg ? fromArg.slice("--from=".length) : "2025-01-01";
  const fromIso = `${fromDate}T00:00:00.000Z`;
  const typeformToken = await getTypeformApiToken();

  if (!typeformToken) {
    throw new Error("TYPEFORM_API_TOKEN or TYPEFORM_ACCESS_TOKEN is not set, and no api_token was found in integration_settings.TYPEFORM.");
  }

  const forms = await sql`
    SELECT id::text, form_id, name, section_rules
    FROM typeform_forms
    WHERE enabled = true
      AND workflow = 'external_questionnaire'
      AND entity_kind = 'PARTNER'
    ORDER BY created_at DESC
  `;

  if (!Array.isArray(forms) || forms.length === 0) {
    console.log("No enabled PARTNER external_questionnaire forms found.");
    return;
  }

  const entities = await sql`
    SELECT id::text, name
    FROM entities
    WHERE kind = 'PARTNER'
  `;

  const entityNameMap = new Map();
  for (const row of entities) {
    const normalized = normalizeComparable(row.name);
    if (!normalized) continue;
    const current = entityNameMap.get(normalized) ?? [];
    current.push({ id: row.id, name: row.name });
    entityNameMap.set(normalized, current);
  }

  let totalResponses = 0;
  let totalRows = 0;

  for (const form of forms) {
    const tableName = resolvePartnerQuestionnaireTable(form.name);
    if (!tableName) {
      console.warn(`Skipping form without mapped table: ${form.name} (${form.form_id})`);
      continue;
    }

    console.log(`Backfilling ${form.name} (${form.form_id}) -> ${tableName}`);
    const fields = await getTypeformFormFields(form.form_id, typeformToken);
    const questionMappings = await sql`
      SELECT question_key, question_ref, question_text, question_order, section::text
      FROM typeform_form_question_mappings
      WHERE typeform_form_config_id = ${form.id}::uuid
      ORDER BY question_order ASC, created_at ASC
    `.catch((error) => {
      if (error?.code === "42P01") return [];
      throw error;
    });
    const responses = await fetchAllResponsesSince(form.form_id, typeformToken, fromIso);
    console.log(`  responses fetched: ${responses.length}`);

    for (const response of responses) {
      if (!response?.token) continue;

      const enrichedAnswers = sortTypeformAnswersByFieldDefinitions(
        applyTypeformFieldDefinitions(response.answers ?? [], fields),
        fields,
      );
      const normalizedAnswers = normalizeTypeformAnswers(enrichedAnswers);
      const sections =
        Array.isArray(questionMappings) && questionMappings.length > 0
          ? resolveSectionsFromMappings(normalizedAnswers, questionMappings)
          : resolveSectionsFromRules(normalizedAnswers, form.section_rules ?? null);
      const companyName = extractCompanyNameFromTypeformAnswers(enrichedAnswers) ?? "";
      const respondentEmail = extractRespondentEmail(enrichedAnswers);
      const entityCandidates = entityNameMap.get(normalizeComparable(companyName)) ?? [];
      const matchedEntity = entityCandidates.length === 1 ? entityCandidates[0] : null;

      await deleteRowsByToken(tableName, response.token);

      for (const [index, answer] of normalizedAnswers.entries()) {
        await insertRow(tableName, {
          entity_id: matchedEntity?.id ?? null,
          assessment_id: null,
          jira_issue_key: null,
          typeform_form_id: form.form_id,
          typeform_response_token: response.token,
          response_submitted_at: response.submitted_at ?? null,
          respondent_email: respondentEmail,
          company_name: companyName || null,
          question_order: index + 1,
          question_key: answer.questionRef || answer.question,
          question_text: answer.question,
          answer_text: answer.value,
          section: sections[index] ?? "UNCLASSIFIED",
          raw_answer: answer.raw,
        });
        totalRows += 1;
      }

      totalResponses += 1;
    }
  }

  console.log(`Backfill completed. Responses processed: ${totalResponses}. Rows inserted: ${totalRows}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
