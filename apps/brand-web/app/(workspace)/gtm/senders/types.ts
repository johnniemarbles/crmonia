export interface SenderDomainRow {
  id: string;
  domain: string;
  provider: 'RESEND' | 'SENDGRID' | 'AWS_SES' | 'CUSTOM_SMTP' | 'GOOGLE_WORKSPACE' | 'OFFICE365';
  dns_verification_records: Array<{
    recordType: 'TXT' | 'CNAME' | 'MX';
    name: string;
    value: string;
    status: 'PENDING' | 'VERIFIED' | 'FAILED';
  }>;
  verification_status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'REVOKED';
  reputation_score: number;
  status: 'ACTIVE' | 'PAUSED' | 'REVOKED';
  owner_node_name: string;
  owner_node_code: string;
  mailbox_count: number;
  created_at: string;
}

export interface MailboxPoolRow {
  id: string;
  domain_id: string;
  domain: string;
  provider: string;
  mailbox_address: string;
  sender_name: string;
  warmup_stage: 'RAMPING' | 'WARMUP' | 'ACTIVE' | 'RESTING' | 'BURNED';
  daily_send_limit: number;
  hourly_send_limit: number;
  sent_today_count: number;
  sent_hour_count: number;
  last_sent_at: string | null;
  bounce_count: number;
  spam_complaint_count: number;
  status: 'ACTIVE' | 'PAUSED' | 'REVOKED';
  owner_node_name: string;
  owner_node_code: string;
}

export interface DispatchQueueStats {
  due_now: number;
  scheduled_future: number;
  completed_count: number;
  bounced_count: number;
  responded_count: number;
}

export interface RecentDispatchRow {
  id: string;
  recipient_email: string;
  subject: string;
  channel: string;
  dispatch_status: string;
  dispatched_at: string | null;
  mailbox_address: string | null;
  sender_name: string | null;
}
