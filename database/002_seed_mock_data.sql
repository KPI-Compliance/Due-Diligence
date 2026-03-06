-- Due Diligence VTEX - Seed data aligned with current UI mock data
-- Idempotent seed (safe to re-run)

BEGIN;

-- Users
INSERT INTO users (id, full_name, email, role_title)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Ana Souza', 'ana.souza@vtex.com', 'Senior Risk Analyst'),
  ('00000000-0000-0000-0000-000000000002', 'Carlos Lima', 'carlos.lima@vtex.com', 'Security Analyst'),
  ('00000000-0000-0000-0000-000000000003', 'Mariana Costa', 'mariana.costa@vtex.com', 'Compliance Specialist'),
  ('00000000-0000-0000-0000-000000000004', 'Lucas Nogueira', 'lucas.nogueira@vtex.com', 'Partner Risk Lead'),
  ('00000000-0000-0000-0000-000000000005', 'Marina Alves', 'marina.alves@vtex.com', 'Governance Analyst'),
  ('00000000-0000-0000-0000-000000000006', 'Bruno Martins', 'bruno.martins@vtex.com', 'Operations Auditor'),
  ('00000000-0000-0000-0000-000000000007', 'Fernanda Rocha', 'fernanda.rocha@vtex.com', 'Integration Risk Specialist')
ON CONFLICT (id) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role_title = EXCLUDED.role_title;

-- Entities (vendors + partners)
INSERT INTO entities (
  id, slug, name, kind, company_group, domain, segment, category, hq_location,
  website, contact_email, description, status, risk_level, risk_score,
  subtitle, status_label, owner_user_id, last_review_at
)
VALUES
  (
    '10000000-0000-0000-0000-000000000001', 'cloudscale-inc', 'CloudScale Inc.', 'VENDOR', 'VTEX',
    'cloudscale.io', 'Cloud Infrastructure', 'Cloud Infrastructure', 'San Francisco, CA',
    'cloudscale.io', 'security@cloudscale.io',
    'CloudScale provides enterprise SaaS infrastructure for high-volume analytics and critical business operations, with continuous audit routines.',
    'IN_REVIEW', 'MEDIUM', 68,
    'Enterprise Vendor', 'Security Review in Progress', '00000000-0000-0000-0000-000000000001', '2026-02-24T12:00:00Z'
  ),
  (
    '10000000-0000-0000-0000-000000000002', 'dataguard-systems', 'DataGuard Systems', 'VENDOR', 'WENI',
    'dataguard.ai', 'Security', 'Cybersecurity', 'Austin, TX',
    'dataguard.ai', 'compliance@dataguard.ai',
    'DataGuard focuses on identity and endpoint protection services for large enterprises operating in regulated sectors.',
    'PENDING', 'HIGH', 74,
    'Security Vendor', 'Awaiting Evidence', '00000000-0000-0000-0000-000000000002', '2026-02-19T12:00:00Z'
  ),
  (
    '10000000-0000-0000-0000-000000000003', 'securepay', 'SecurePay', 'VENDOR', 'VTEX',
    'securepay.com', 'Payments', 'Payments', 'New York, NY',
    'securepay.com', 'risk@securepay.com',
    'SecurePay is a payment gateway provider with strong fraud prevention controls and mature governance procedures.',
    'COMPLETED', 'LOW', 44,
    'Payments Vendor', 'Assessment Completed', '00000000-0000-0000-0000-000000000003', '2026-02-12T12:00:00Z'
  ),
  (
    '10000000-0000-0000-0000-000000000004', 'nexus-databank', 'Nexus Databank', 'VENDOR', 'WENI',
    'nexusdb.io', 'Data Processing', 'Data Processing', 'Chicago, IL',
    'nexusdb.io', 'ops@nexusdb.io',
    'Nexus Databank operates mission-critical processing pipelines and requires enhanced monitoring due to data concentration risks.',
    'IN_REVIEW', 'CRITICAL', 88,
    'Data Processing Vendor', 'Critical Review in Progress', '00000000-0000-0000-0000-000000000001', '2026-02-08T12:00:00Z'
  ),
  (
    '20000000-0000-0000-0000-000000000001', 'prime-logistics', 'Prime Logistics', 'PARTNER', 'VTEX',
    'prime.logistics', 'Distribution', 'Distribution', 'Miami, FL',
    'prime.logistics', 'partner-risk@prime.logistics',
    'Prime Logistics manages large-scale distribution operations with shared systems and contractual controls for incident response.',
    'SENT', 'HIGH', 71,
    'Strategic Partner', 'Security Review in Progress', '00000000-0000-0000-0000-000000000004', '2026-02-26T12:00:00Z'
  ),
  (
    '20000000-0000-0000-0000-000000000002', 'orbit-commerce', 'Orbit Commerce', 'PARTNER', 'WENI',
    'orbit-commerce.com', 'Marketplace', 'Marketplace', 'Seattle, WA',
    'orbit-commerce.com', 'governance@orbit-commerce.com',
    'Orbit Commerce enables joint marketplace operations and requires periodic reassessment of data-sharing boundaries.',
    'IN_REVIEW', 'MEDIUM', 63,
    'Marketplace Partner', 'Under Analysis', '00000000-0000-0000-0000-000000000005', '2026-02-21T12:00:00Z'
  ),
  (
    '20000000-0000-0000-0000-000000000003', 'blueroute', 'BlueRoute', 'PARTNER', 'VTEX',
    'blueroute.app', 'Operations', 'Operations', 'Denver, CO',
    'blueroute.app', 'security@blueroute.app',
    'BlueRoute provides operations enablement services and maintains low risk exposure with proven continuity controls.',
    'COMPLETED', 'LOW', 39,
    'Operations Partner', 'Assessment Completed', '00000000-0000-0000-0000-000000000006', '2026-02-15T12:00:00Z'
  ),
  (
    '20000000-0000-0000-0000-000000000004', 'nexus-flows', 'Nexus Flows', 'PARTNER', 'WENI',
    'nexusflows.net', 'Integration', 'Integration', 'Boston, MA',
    'nexusflows.net', 'trust@nexusflows.net',
    'Nexus Flows integrates multiple business systems and is flagged for deeper due diligence due to elevated operational criticality.',
    'PENDING', 'CRITICAL', 82,
    'Integration Partner', 'Awaiting Response', '00000000-0000-0000-0000-000000000007', '2026-02-10T12:00:00Z'
  )
ON CONFLICT (id) DO UPDATE
SET
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  company_group = EXCLUDED.company_group,
  domain = EXCLUDED.domain,
  segment = EXCLUDED.segment,
  category = EXCLUDED.category,
  hq_location = EXCLUDED.hq_location,
  website = EXCLUDED.website,
  contact_email = EXCLUDED.contact_email,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  risk_level = EXCLUDED.risk_level,
  risk_score = EXCLUDED.risk_score,
  subtitle = EXCLUDED.subtitle,
  status_label = EXCLUDED.status_label,
  owner_user_id = EXCLUDED.owner_user_id,
  last_review_at = EXCLUDED.last_review_at;

-- Internal focal points
INSERT INTO internal_focal_points (id, entity_id, full_name, role_title, area, email, phone)
VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Sarah Johnson', 'Risk Manager', 'InfoSec & GRC', 'sarah.johnson@vtex.com', '+1 (415) 555-0148'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Carlos Lima', 'Security Analyst', 'Third-Party Risk', 'carlos.lima@vtex.com', '+1 (737) 555-0192'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Mariana Costa', 'Compliance Specialist', 'Payments Governance', 'mariana.costa@vtex.com', '+1 (646) 555-0133'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'Ana Souza', 'Senior Risk Analyst', 'Data Governance', 'ana.souza@vtex.com', '+1 (312) 555-0179'),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'Lucas Nogueira', 'Partner Risk Lead', 'Logistics Partnerships', 'lucas.nogueira@vtex.com', '+1 (305) 555-0114'),
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000002', 'Marina Alves', 'Governance Analyst', 'Marketplace Risk', 'marina.alves@vtex.com', '+1 (206) 555-0187'),
  ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000003', 'Bruno Martins', 'Operations Auditor', 'Operational Controls', 'bruno.martins@vtex.com', '+1 (303) 555-0162'),
  ('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000004', 'Fernanda Rocha', 'Integration Risk Specialist', 'Partner Integrations', 'fernanda.rocha@vtex.com', '+1 (617) 555-0106')
ON CONFLICT (entity_id) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  role_title = EXCLUDED.role_title,
  area = EXCLUDED.area,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone;

-- Assessments (one active baseline per entity)
INSERT INTO assessments (
  id, entity_id, analyst_user_id, title, status, risk_level, progress_percent,
  sent_at, responded_at, due_at, completed_at
)
VALUES
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Security Assessment - CloudScale', 'IN_REVIEW', 'MEDIUM', 100, '2025-10-12T10:30:00Z', '2025-10-18T09:45:00Z', '2025-10-30T23:59:00Z', NULL),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Security Assessment - DataGuard', 'PENDING', 'HIGH', 0, NULL, NULL, '2025-11-05T23:59:00Z', NULL),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'Security Assessment - SecurePay', 'COMPLETED', 'LOW', 100, '2025-10-01T09:00:00Z', '2025-10-05T12:00:00Z', '2025-10-20T23:59:00Z', '2025-10-15T11:00:00Z'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Security Assessment - Nexus Databank', 'IN_REVIEW', 'CRITICAL', 60, '2025-10-10T10:00:00Z', '2025-10-17T15:00:00Z', '2025-10-31T23:59:00Z', NULL),
  ('40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'Partner Assessment - Prime Logistics', 'SENT', 'HIGH', 45, '2025-10-18T13:00:00Z', NULL, '2025-11-01T23:59:00Z', NULL),
  ('40000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'Partner Assessment - Orbit Commerce', 'IN_REVIEW', 'MEDIUM', 75, '2025-10-15T09:00:00Z', '2025-10-20T11:00:00Z', '2025-11-03T23:59:00Z', NULL),
  ('40000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'Partner Assessment - BlueRoute', 'COMPLETED', 'LOW', 100, '2025-09-28T09:00:00Z', '2025-10-03T10:00:00Z', '2025-10-18T23:59:00Z', '2025-10-12T16:00:00Z'),
  ('40000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000007', 'Partner Assessment - Nexus Flows', 'PENDING', 'CRITICAL', 0, NULL, NULL, '2025-11-10T23:59:00Z', NULL)
ON CONFLICT (id) DO UPDATE
SET
  entity_id = EXCLUDED.entity_id,
  analyst_user_id = EXCLUDED.analyst_user_id,
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  risk_level = EXCLUDED.risk_level,
  progress_percent = EXCLUDED.progress_percent,
  sent_at = EXCLUDED.sent_at,
  responded_at = EXCLUDED.responded_at,
  due_at = EXCLUDED.due_at,
  completed_at = EXCLUDED.completed_at;

-- Question responses (same template for all assessments)
INSERT INTO assessment_question_responses (id, assessment_id, domain, question_text, answer_text, review_status)
VALUES
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Access Control', 'How does your organization manage administrative access to production systems?', 'We use a Just-In-Time access model with MFA and complete session logging. Direct SSH access is disabled and approvals are mandatory.', 'COMPLIANT'),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'Data Encryption', 'Describe the encryption standards used for data at rest and in transit.', 'Data at rest uses AES-256 and all connections are enforced with TLS 1.3. Key rotation is automated using managed KMS policies.', 'COMPLIANT'),
  ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'Incident Response', 'What is your notification timeline for a confirmed security breach?', 'We notify impacted customers within 72 hours of confirmation. Internal triage starts immediately and regulatory teams are engaged per jurisdiction.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', 'Vulnerability Management', 'How often are penetration tests performed on your platform?', 'Independent penetration tests are performed annually and complemented by continuous vulnerability scanning and a private bug bounty program.', 'COMPLIANT'),

  ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000002', 'Access Control', 'How does your organization manage administrative access to production systems?', 'Awaiting response.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000002', 'Data Encryption', 'Describe the encryption standards used for data at rest and in transit.', 'Awaiting response.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000002', 'Incident Response', 'What is your notification timeline for a confirmed security breach?', 'Awaiting response.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000002', 'Vulnerability Management', 'How often are penetration tests performed on your platform?', 'Awaiting response.', 'NEEDS_REVIEW'),

  ('50000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000003', 'Access Control', 'How does your organization manage administrative access to production systems?', 'Completed and validated.', 'COMPLIANT'),
  ('50000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000003', 'Data Encryption', 'Describe the encryption standards used for data at rest and in transit.', 'Completed and validated.', 'COMPLIANT'),
  ('50000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000003', 'Incident Response', 'What is your notification timeline for a confirmed security breach?', 'Completed and validated.', 'COMPLIANT'),
  ('50000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000003', 'Vulnerability Management', 'How often are penetration tests performed on your platform?', 'Completed and validated.', 'COMPLIANT'),

  ('50000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000004', 'Access Control', 'How does your organization manage administrative access to production systems?', 'Under review.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000004', 'Data Encryption', 'Describe the encryption standards used for data at rest and in transit.', 'Under review.', 'COMPLIANT'),
  ('50000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000004', 'Incident Response', 'What is your notification timeline for a confirmed security breach?', 'Under review.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000004', 'Vulnerability Management', 'How often are penetration tests performed on your platform?', 'Under review.', 'COMPLIANT'),

  ('50000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000005', 'Access Control', 'How does your organization manage administrative access to production systems?', 'Questionnaire sent.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000005', 'Data Encryption', 'Describe the encryption standards used for data at rest and in transit.', 'Questionnaire sent.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000019', '40000000-0000-0000-0000-000000000005', 'Incident Response', 'What is your notification timeline for a confirmed security breach?', 'Questionnaire sent.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000005', 'Vulnerability Management', 'How often are penetration tests performed on your platform?', 'Questionnaire sent.', 'NEEDS_REVIEW'),

  ('50000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000006', 'Access Control', 'How does your organization manage administrative access to production systems?', 'In review.', 'COMPLIANT'),
  ('50000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000006', 'Data Encryption', 'Describe the encryption standards used for data at rest and in transit.', 'In review.', 'COMPLIANT'),
  ('50000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000006', 'Incident Response', 'What is your notification timeline for a confirmed security breach?', 'In review.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000024', '40000000-0000-0000-0000-000000000006', 'Vulnerability Management', 'How often are penetration tests performed on your platform?', 'In review.', 'COMPLIANT'),

  ('50000000-0000-0000-0000-000000000025', '40000000-0000-0000-0000-000000000007', 'Access Control', 'How does your organization manage administrative access to production systems?', 'Completed and validated.', 'COMPLIANT'),
  ('50000000-0000-0000-0000-000000000026', '40000000-0000-0000-0000-000000000007', 'Data Encryption', 'Describe the encryption standards used for data at rest and in transit.', 'Completed and validated.', 'COMPLIANT'),
  ('50000000-0000-0000-0000-000000000027', '40000000-0000-0000-0000-000000000007', 'Incident Response', 'What is your notification timeline for a confirmed security breach?', 'Completed and validated.', 'COMPLIANT'),
  ('50000000-0000-0000-0000-000000000028', '40000000-0000-0000-0000-000000000007', 'Vulnerability Management', 'How often are penetration tests performed on your platform?', 'Completed and validated.', 'COMPLIANT'),

  ('50000000-0000-0000-0000-000000000029', '40000000-0000-0000-0000-000000000008', 'Access Control', 'How does your organization manage administrative access to production systems?', 'Awaiting response.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000008', 'Data Encryption', 'Describe the encryption standards used for data at rest and in transit.', 'Awaiting response.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000008', 'Incident Response', 'What is your notification timeline for a confirmed security breach?', 'Awaiting response.', 'NEEDS_REVIEW'),
  ('50000000-0000-0000-0000-000000000032', '40000000-0000-0000-0000-000000000008', 'Vulnerability Management', 'How often are penetration tests performed on your platform?', 'Awaiting response.', 'NEEDS_REVIEW')
ON CONFLICT (id) DO UPDATE
SET
  assessment_id = EXCLUDED.assessment_id,
  domain = EXCLUDED.domain,
  question_text = EXCLUDED.question_text,
  answer_text = EXCLUDED.answer_text,
  review_status = EXCLUDED.review_status;

-- Risk breakdown by entity dimension
INSERT INTO entity_risk_breakdowns (id, entity_id, dimension, level, score)
VALUES
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Security', 'LOW', 85),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Privacy', 'MEDIUM', 60),
  ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Financial', 'LOW', 75),
  ('60000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Operational', 'HIGH', 40),

  ('60000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'Security', 'HIGH', 45),
  ('60000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 'Privacy', 'MEDIUM', 58),
  ('60000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', 'Financial', 'MEDIUM', 55),
  ('60000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', 'Operational', 'HIGH', 42),

  ('60000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000003', 'Security', 'LOW', 90),
  ('60000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000003', 'Privacy', 'LOW', 78),
  ('60000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000003', 'Financial', 'LOW', 82),
  ('60000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000003', 'Operational', 'LOW', 80),

  ('60000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000004', 'Security', 'HIGH', 38),
  ('60000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000004', 'Privacy', 'HIGH', 41),
  ('60000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000004', 'Financial', 'MEDIUM', 57),
  ('60000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000004', 'Operational', 'HIGH', 35)
ON CONFLICT (id) DO UPDATE
SET
  entity_id = EXCLUDED.entity_id,
  dimension = EXCLUDED.dimension,
  level = EXCLUDED.level,
  score = EXCLUDED.score;

-- Timeline events (for key detail pages)
INSERT INTO entity_timeline_events (id, entity_id, title, note, event_at, sort_order, is_current)
VALUES
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Request Created', 'Initiated by Sarah Johnson', '2025-10-12T10:30:00Z', 1, false),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Questionnaire Sent', 'Standard Security V2.1', '2025-10-13T14:15:00Z', 2, false),
  ('70000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Response Received', '100% completion rate', '2025-10-18T09:45:00Z', 3, false),
  ('70000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Analysis Started', 'Currently in progress...', '2025-10-19T11:00:00Z', 4, true)
ON CONFLICT (id) DO UPDATE
SET
  entity_id = EXCLUDED.entity_id,
  title = EXCLUDED.title,
  note = EXCLUDED.note,
  event_at = EXCLUDED.event_at,
  sort_order = EXCLUDED.sort_order,
  is_current = EXCLUDED.is_current;

-- Decisions
INSERT INTO assessment_decisions (
  id, assessment_id,
  security_level, security_note,
  privacy_level, privacy_note,
  compliance_level, compliance_note,
  combined_score, classification,
  selected_option, conditions_for_approval, mitigation_plan,
  approval_expires_at
)
VALUES
  (
    '80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    'HIGH', 'Vulnerabilities in infrastructure controls and missing SOC2 evidence.',
    'MEDIUM', 'Data residency documentation is incomplete for EU operations.',
    'LOW', 'Complies with standard onboarding and policy requirements.',
    6.8, 'Moderate Threat',
    'APPROVED_WITH_RESTRICTIONS',
    'Enable enhanced monitoring and deliver missing SOC2 evidence within 30 days.',
    'Close open control gaps, run external validation, and submit remediation proof.',
    '2026-12-31'
  )
ON CONFLICT (assessment_id) DO UPDATE
SET
  security_level = EXCLUDED.security_level,
  security_note = EXCLUDED.security_note,
  privacy_level = EXCLUDED.privacy_level,
  privacy_note = EXCLUDED.privacy_note,
  compliance_level = EXCLUDED.compliance_level,
  compliance_note = EXCLUDED.compliance_note,
  combined_score = EXCLUDED.combined_score,
  classification = EXCLUDED.classification,
  selected_option = EXCLUDED.selected_option,
  conditions_for_approval = EXCLUDED.conditions_for_approval,
  mitigation_plan = EXCLUDED.mitigation_plan,
  approval_expires_at = EXCLUDED.approval_expires_at;

-- Analysis notes
INSERT INTO assessment_notes (id, assessment_id, section, notes, recommendations, author_user_id)
VALUES
  (
    '90000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'security_review',
    'Initial analysis completed with moderate concerns in incident response controls.',
    'Require updated incident response runbook and escalation matrix.',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT (id) DO UPDATE
SET
  assessment_id = EXCLUDED.assessment_id,
  section = EXCLUDED.section,
  notes = EXCLUDED.notes,
  recommendations = EXCLUDED.recommendations,
  author_user_id = EXCLUDED.author_user_id;

COMMIT;
