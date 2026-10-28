import { Pool, PoolClient } from 'pg';

let poolInstance: Pool | null = null;

export function getDbPool(): Pool {
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/crmonia',
      max: 25,
    });
  }
  return poolInstance;
}

export interface HierarchicalSessionContext {
  userId: string;
  tenantId: string;
  orgNodeId: string;
  orgPath: string; // e.g., 'root.hq_1.ca_opco.on_reg.mississauga_br'
  countryCode: 'CA' | 'US' | 'GLOBAL';
  role:
    | 'MAIN_ADMIN'
    | 'COUNTRY_ADMIN'
    | 'COMPLIANCE_OFFICER'
    | 'BRANCH_MANAGER'
    | 'UNIT_ADVISOR'
    | 'READ_ONLY_AUDITOR';
}

/**
 * Executes a callback inside a PostgreSQL transaction with cryptographic
 * tenant, ltree org_path, and country residency context bound via SET LOCAL.
 */
export async function withRlsTransaction<T>(
  ctx: HierarchicalSessionContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Bind session variables for PostgreSQL FORCE ROW LEVEL SECURITY policies
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [ctx.tenantId]);
    await client.query(`SELECT set_config('app.current_org_path', $1, true)`, [ctx.orgPath]);
    await client.query(`SELECT set_config('app.current_country_code', $1, true)`, [ctx.countryCode]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [ctx.userId]);

    const result = await fn(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
