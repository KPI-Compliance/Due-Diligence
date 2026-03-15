export type ReviewStatus = "compliant" | "needs_review";
export type AnalystEvaluationStatus = "NOT_EVALUATED" | "NA" | "DOES_NOT_MEET" | "PARTIALLY" | "FULLY";

export type RiskLevel = "Low" | "Medium" | "High" | "Pending";

export type DetailTabKey =
  | "overview"
  | "internal_questionnaire"
  | "external_questionnaire"
  | "evidence"
  | "security_review"
  | "privacy_review"
  | "decision";

export type EntityDetailData = {
  id: string;
  name: string;
  jiraTicket: string | null;
  externalQuestionnaire: {
    assessmentId?: string | null;
    formId: string | null;
    formName: string | null;
    responseTable?: string | null;
    source: "typeform" | "google_sheets" | "database";
    submittedAt?: string;
  };
  subtitle: string;
  statusLabel: string;
  statusMode: "pending" | "in_review" | "completed";
  riskScore: number;
  internalQuestionnaire: {
    requester: string;
    ticket: string;
    vendor: string;
    status: string;
    submittedAt?: string;
    source: "google_sheets" | "database";
    questions: Array<{
      question: string;
      answer: string;
    }>;
  } | null;
  questions: Array<{
    responseId?: string;
    domain: string;
    section?: "Common" | "Compliance" | "Privacy" | "Security" | "Unclassified";
    status: ReviewStatus;
    analystEvaluation?: AnalystEvaluationStatus;
    analystObservations?: string;
    question: string;
    answer: string;
    evidenceUrl?: string;
    source?: "database" | "google_sheets";
  }>;
  overview: {
    category: string;
    hqLocation: string;
    website: string;
    contact: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    internalFocalPoint: {
      name: string;
      role: string;
      area: string;
      email: string;
      phone: string;
    };
    description: string;
    riskBreakdown: Array<{
      label: "Security" | "Privacy" | "Financial" | "Operational";
      score: number;
      level: RiskLevel;
    }>;
    timeline: Array<{
      title: string;
      date: string;
      note: string;
      current?: boolean;
    }>;
  };
  decision: {
    security: { level: RiskLevel; note: string; score?: string };
    privacy: { level: RiskLevel; note: string; score?: string };
    compliance: { level: RiskLevel; note: string; score?: string };
    combinedScore: string;
    classification: string;
  };
};
