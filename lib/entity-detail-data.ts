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

const baseQuestions: EntityDetailData["questions"] = [
  {
    domain: "Access Control",
    status: "compliant",
    question: "How does your organization manage administrative access to production systems?",
    answer:
      "We use a Just-In-Time access model with MFA and complete session logging. Direct SSH access is disabled and approvals are mandatory.",
  },
  {
    domain: "Data Encryption",
    status: "compliant",
    question: "Describe the encryption standards used for data at rest and in transit.",
    answer:
      "Data at rest uses AES-256 and all connections are enforced with TLS 1.3. Key rotation is automated using managed KMS policies.",
  },
  {
    domain: "Incident Response",
    status: "needs_review",
    question: "What is your notification timeline for a confirmed security breach?",
    answer:
      "We notify impacted customers within 72 hours of confirmation. Internal triage starts immediately and regulatory teams are engaged per jurisdiction.",
  },
  {
    domain: "Vulnerability Management",
    status: "compliant",
    question: "How often are penetration tests performed on your platform?",
    answer:
      "Independent penetration tests are performed annually and complemented by continuous vulnerability scanning and a private bug bounty program.",
  },
];

function makeOverview(
  category: string,
  hqLocation: string,
  website: string,
  contact: string,
  description: string,
  internalFocalPoint: {
    name: string;
    role: string;
    area: string;
    email: string;
    phone: string;
  },
) {
  return {
    category,
    hqLocation,
    website,
    contact,
    internalFocalPoint,
    description,
    riskBreakdown: [
      { label: "Security" as const, score: 85, level: "Low" as const },
      { label: "Privacy" as const, score: 60, level: "Medium" as const },
      { label: "Financial" as const, score: 75, level: "Low" as const },
      { label: "Operational" as const, score: 40, level: "High" as const },
    ],
    timeline: [
      { title: "Request Created", date: "12 out 2025 · 10:30", note: "Initiated by Sarah Johnson" },
      { title: "Questionnaire Sent", date: "13 out 2025 · 14:15", note: "Standard Security V2.1" },
      { title: "Response Received", date: "18 out 2025 · 09:45", note: "100% completion rate" },
      { title: "Analysis Started", date: "19 out 2025 · 11:00", note: "Currently in progress...", current: true },
    ],
  };
}

const baseDecision: EntityDetailData["decision"] = {
  security: {
    level: "High",
    note: "Vulnerabilities in infrastructure controls and missing SOC2 evidence.",
  },
  privacy: {
    level: "Medium",
    note: "Data residency documentation is incomplete for EU operations.",
  },
  compliance: {
    level: "Low",
    note: "Complies with standard onboarding and policy requirements.",
  },
  combinedScore: "6.8",
  classification: "Moderate Threat",
};

export const vendorDetailMap: Record<string, EntityDetailData> = {
  "cloudscale-inc": {
    id: "cloudscale-inc",
    name: "CloudScale Inc.",
    subtitle: "Enterprise Vendor",
    statusLabel: "Security Review in Progress",
    statusMode: "in_review",
    riskScore: 68,
    questions: baseQuestions,
    overview: makeOverview(
      "Cloud Infrastructure",
      "San Francisco, CA",
      "cloudscale.io",
      "security@cloudscale.io",
      "CloudScale provides enterprise SaaS infrastructure for high-volume analytics and critical business operations, with continuous audit routines.",
      {
        name: "Sarah Johnson",
        role: "Risk Manager",
        area: "InfoSec & GRC",
        email: "sarah.johnson@vtex.com",
        phone: "+1 (415) 555-0148",
      },
    ),
    decision: baseDecision,
  },
  "dataguard-systems": {
    id: "dataguard-systems",
    name: "DataGuard Systems",
    subtitle: "Security Vendor",
    statusLabel: "Awaiting Evidence",
    statusMode: "pending",
    riskScore: 74,
    questions: baseQuestions,
    overview: makeOverview(
      "Cybersecurity",
      "Austin, TX",
      "dataguard.ai",
      "compliance@dataguard.ai",
      "DataGuard focuses on identity and endpoint protection services for large enterprises operating in regulated sectors.",
      {
        name: "Carlos Lima",
        role: "Security Analyst",
        area: "Third-Party Risk",
        email: "carlos.lima@vtex.com",
        phone: "+1 (737) 555-0192",
      },
    ),
    decision: baseDecision,
  },
  securepay: {
    id: "securepay",
    name: "SecurePay",
    subtitle: "Payments Vendor",
    statusLabel: "Assessment Completed",
    statusMode: "completed",
    riskScore: 44,
    questions: baseQuestions,
    overview: makeOverview(
      "Payments",
      "New York, NY",
      "securepay.com",
      "risk@securepay.com",
      "SecurePay is a payment gateway provider with strong fraud prevention controls and mature governance procedures.",
      {
        name: "Mariana Costa",
        role: "Compliance Specialist",
        area: "Payments Governance",
        email: "mariana.costa@vtex.com",
        phone: "+1 (646) 555-0133",
      },
    ),
    decision: baseDecision,
  },
  "nexus-databank": {
    id: "nexus-databank",
    name: "Nexus Databank",
    subtitle: "Data Processing Vendor",
    statusLabel: "Critical Review in Progress",
    statusMode: "in_review",
    riskScore: 88,
    questions: baseQuestions,
    overview: makeOverview(
      "Data Processing",
      "Chicago, IL",
      "nexusdb.io",
      "ops@nexusdb.io",
      "Nexus Databank operates mission-critical processing pipelines and requires enhanced monitoring due to data concentration risks.",
      {
        name: "Ana Souza",
        role: "Senior Risk Analyst",
        area: "Data Governance",
        email: "ana.souza@vtex.com",
        phone: "+1 (312) 555-0179",
      },
    ),
    decision: baseDecision,
  },
};

export const partnerDetailMap: Record<string, EntityDetailData> = {
  "prime-logistics": {
    id: "prime-logistics",
    name: "Prime Logistics",
    subtitle: "Strategic Partner",
    statusLabel: "Security Review in Progress",
    statusMode: "in_review",
    riskScore: 71,
    questions: baseQuestions,
    overview: makeOverview(
      "Distribution",
      "Miami, FL",
      "prime.logistics",
      "partner-risk@prime.logistics",
      "Prime Logistics manages large-scale distribution operations with shared systems and contractual controls for incident response.",
      {
        name: "Lucas Nogueira",
        role: "Partner Risk Lead",
        area: "Logistics Partnerships",
        email: "lucas.nogueira@vtex.com",
        phone: "+1 (305) 555-0114",
      },
    ),
    decision: baseDecision,
  },
  "orbit-commerce": {
    id: "orbit-commerce",
    name: "Orbit Commerce",
    subtitle: "Marketplace Partner",
    statusLabel: "Under Analysis",
    statusMode: "in_review",
    riskScore: 63,
    questions: baseQuestions,
    overview: makeOverview(
      "Marketplace",
      "Seattle, WA",
      "orbit-commerce.com",
      "governance@orbit-commerce.com",
      "Orbit Commerce enables joint marketplace operations and requires periodic reassessment of data-sharing boundaries.",
      {
        name: "Marina Alves",
        role: "Governance Analyst",
        area: "Marketplace Risk",
        email: "marina.alves@vtex.com",
        phone: "+1 (206) 555-0187",
      },
    ),
    decision: baseDecision,
  },
  blueroute: {
    id: "blueroute",
    name: "BlueRoute",
    subtitle: "Operations Partner",
    statusLabel: "Assessment Completed",
    statusMode: "completed",
    riskScore: 39,
    questions: baseQuestions,
    overview: makeOverview(
      "Operations",
      "Denver, CO",
      "blueroute.app",
      "security@blueroute.app",
      "BlueRoute provides operations enablement services and maintains low risk exposure with proven continuity controls.",
      {
        name: "Bruno Martins",
        role: "Operations Auditor",
        area: "Operational Controls",
        email: "bruno.martins@vtex.com",
        phone: "+1 (303) 555-0162",
      },
    ),
    decision: baseDecision,
  },
  "nexus-flows": {
    id: "nexus-flows",
    name: "Nexus Flows",
    subtitle: "Integration Partner",
    statusLabel: "Awaiting Response",
    statusMode: "pending",
    riskScore: 82,
    questions: baseQuestions,
    overview: makeOverview(
      "Integration",
      "Boston, MA",
      "nexusflows.net",
      "trust@nexusflows.net",
      "Nexus Flows integrates multiple business systems and is flagged for deeper due diligence due to elevated operational criticality.",
      {
        name: "Fernanda Rocha",
        role: "Integration Risk Specialist",
        area: "Partner Integrations",
        email: "fernanda.rocha@vtex.com",
        phone: "+1 (617) 555-0106",
      },
    ),
    decision: baseDecision,
  },
};
