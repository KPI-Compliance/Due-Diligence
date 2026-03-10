export type ReviewStatus = "compliant" | "needs_review";

export type RiskLevel = "Low" | "Medium" | "High";

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
  subtitle: string;
  statusLabel: string;
  statusMode: "pending" | "in_review" | "completed";
  riskScore: number;
  questions: Array<{
    domain: string;
    status: ReviewStatus;
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
    security: { level: RiskLevel; note: string };
    privacy: { level: RiskLevel; note: string };
    compliance: { level: RiskLevel; note: string };
    combinedScore: string;
    classification: string;
  };
};
