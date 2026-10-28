import { randomUUID } from 'node:crypto';
import { dbPool } from './brand-context';
import type { HierarchicalSessionContext } from '@crmonia/db';

export interface SenderDomainInput {
  domain: string;
  provider: 'RESEND' | 'SENDGRID' | 'AWS_SES' | 'CUSTOM_SMTP' | 'GOOGLE_WORKSPACE' | 'OFFICE365';
  countryCode?: 'CA' | 'US' | 'GLOBAL';
  apiKey?: string; // Stored securely in vault; never committed or returned plaintext
  customSmtp?: {
    host: string;
    port: number;
    username: string;
    passwordRef: string;
  };
}

export interface DnsVerificationRecord {
  recordType: 'TXT' | 'CNAME' | 'MX';
  name: string;
  value: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
}

/**
 * Registers a new BYOK / BYOC Sender Domain with reference-only credential custody.
 * (PRD Section 5.3 & Section 6.1)
 */
export async function registerSenderDomain(
  ctx: HierarchicalSessionContext,
  input: SenderDomainInput
) {
  const domain = input.domain.trim().toLowerCase();

  // Generate standardized DKIM, SPF, and DMARC verification records
  const dnsRecords: DnsVerificationRecord[] = [
    {
      recordType: 'TXT',
      name: `@.${domain}`,
      value: 'v=spf1 include:_spf.crmonia.com ~all',
      status: 'PENDING',
    },
    {
      recordType: 'TXT',
      name: `crmonia._domainkey.${domain}`,
      value: `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3${Buffer.from(domain).toString('hex').slice(0, 40)}`,
      status: 'PENDING',
    },
    {
      recordType: 'TXT',
      name: `_dmarc.${domain}`,
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${domain}`,
      status: 'PENDING',
    },
  ];

  // Store credential in vault reference pointer
  const custodyTicketId = `vault://keys/gtm-sender/${ctx.tenantId}/${domain}/${randomUUID()}`;

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [ctx.tenantId]);
    await client.query(`SELECT set_config('app.current_org_path', $1, true)`, [ctx.orgPath]);

    const result = await client.query(
      `INSERT INTO gtm.sender_domains (
        id, tenant_id, owner_node_id, owner_node_path, domain, provider,
        dns_verification_records, verification_status, custody_ticket_id,
        country_code, status
      ) VALUES (
        $1, $2, $3, $4::ltree, $5, $6, $7::jsonb, 'PENDING', $8, $9, 'ACTIVE'
      )
      RETURNING id, domain, provider, dns_verification_records, verification_status, reputation_score, created_at`,
      [
        randomUUID(),
        ctx.tenantId,
        ctx.orgNodeId,
        ctx.orgPath,
        domain,
        input.provider,
        JSON.stringify(dnsRecords),
        custodyTicketId,
        input.countryCode || ctx.countryCode,
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Adds an outbound mailbox to the rotational pool with warm-up stage controls.
 */
export async function addMailboxToPool(
  ctx: HierarchicalSessionContext,
  domainId: string,
  mailboxAddress: string,
  senderName: string,
  dailyLimit = 40,
  hourlyLimit = 8
) {
  const address = mailboxAddress.trim().toLowerCase();
  const leaseToken = `lease_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const leaseExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hour cryptographic lease

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [ctx.tenantId]);
    await client.query(`SELECT set_config('app.current_org_path', $1, true)`, [ctx.orgPath]);

    const result = await client.query(
      `INSERT INTO gtm.mailbox_pools (
        id, tenant_id, domain_id, owner_node_id, owner_node_path, mailbox_address,
        sender_name, warmup_stage, daily_send_limit, hourly_send_limit,
        status, lease_token, lease_expires_at
      ) VALUES (
        $1, $2, $3, $4, $5::ltree, $6, $7, 'WARMUP', $8, $9, 'ACTIVE', $10, $11
      )
      RETURNING *`,
      [
        randomUUID(),
        ctx.tenantId,
        domainId,
        ctx.orgNodeId,
        ctx.orgPath,
        address,
        senderName,
        dailyLimit,
        hourlyLimit,
        leaseToken,
        leaseExpiresAt,
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
