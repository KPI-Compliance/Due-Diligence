import crypto from "node:crypto";

type TypeformChoice = { label?: string };
type TypeformChoices = { labels?: string[] };

export type TypeformAnswer = {
  type?: string;
  field?: {
    ref?: string;
    title?: string;
    type?: string;
  };
  text?: string;
  email?: string;
  number?: number;
  boolean?: boolean;
  date?: string;
  url?: string;
  file_url?: string;
  phone_number?: string;
  choice?: TypeformChoice;
  choices?: TypeformChoices;
};

const companyQuestionCandidates = [
  "what's the company name?",
  "whats the company name?",
  "what is the company name?",
  "company name",
  "qual e o nome da empresa?",
  "qual é o nome da empresa?",
  "nome da empresa",
  "nome do vendor",
  "vendor name",
];

const ticketQuestionCandidates = [
  "jira ticket",
  "ticket jira",
  "qual e o id do ticket do jira?",
  "qual é o id do ticket do jira?",
  "ticket",
];

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyTypeformSignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) return false;

  const digestBase64 = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const digestHex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const candidates = [
    `sha256=${digestBase64}`,
    digestBase64,
    `sha256=${digestHex}`,
    digestHex,
  ];

  return candidates.some((candidate) => safeEqual(signatureHeader, candidate));
}

function answerToText(answer: TypeformAnswer): string {
  if (typeof answer.text === "string") return answer.text;
  if (typeof answer.email === "string") return answer.email;
  if (typeof answer.number === "number") return answer.number.toString();
  if (typeof answer.boolean === "boolean") return answer.boolean ? "true" : "false";
  if (typeof answer.date === "string") return answer.date;
  if (typeof answer.url === "string") return answer.url;
  if (typeof answer.file_url === "string") return answer.file_url;
  if (typeof answer.phone_number === "string") return answer.phone_number;
  if (answer.choice?.label) return answer.choice.label;
  if (answer.choices?.labels?.length) return answer.choices.labels.join(", ");

  return "";
}

function normalizeComparable(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeTypeformAnswers(answers: TypeformAnswer[] | undefined) {
  if (!answers?.length) return [];

  return answers.map((answer, index) => {
    const question = answer.field?.title ?? answer.field?.ref ?? `Question ${index + 1}`;
    const domain = answer.field?.type ?? answer.type ?? "typeform";

    return {
      domain,
      question,
      value: answerToText(answer),
    };
  });
}

function findAnswerByQuestionCandidates(answers: TypeformAnswer[] | undefined, candidates: string[]) {
  if (!answers?.length) return null;

  const normalizedCandidates = candidates.map(normalizeComparable);
  for (const answer of answers) {
    const fieldTitle = normalizeComparable(answer.field?.title);
    const fieldRef = normalizeComparable(answer.field?.ref);
    if (normalizedCandidates.includes(fieldTitle) || normalizedCandidates.includes(fieldRef)) {
      const value = answerToText(answer).trim();
      if (value) return value;
    }
  }

  return null;
}

export function extractCompanyNameFromTypeformAnswers(answers: TypeformAnswer[] | undefined) {
  return findAnswerByQuestionCandidates(answers, companyQuestionCandidates);
}

export function extractTicketFromTypeformAnswers(answers: TypeformAnswer[] | undefined) {
  return findAnswerByQuestionCandidates(answers, ticketQuestionCandidates);
}

export function normalizeAssessmentId(
  hidden: Record<string, string> | undefined,
  preferredField = "assessment_id",
) {
  if (!hidden) return null;

  return hidden[preferredField] ?? hidden.assessment_id ?? hidden.assessmentId ?? hidden.assessment ?? null;
}
