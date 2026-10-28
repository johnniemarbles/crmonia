import { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { HierarchicalSessionContext } from '@crmonia/db/rls-session';

const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const DEFAULT_ORG_NODE_ID = '00000000-0000-4000-8000-000000000010';
const DEFAULT_USER_ID = '00000000-0000-4000-8000-000000000099';

export async function getServerHierarchySession(
  cookieStore?: any
): Promise<HierarchicalSessionContext> {
  const tenantId = cookieStore?.get?.('crmonia_tenant_id')?.value || DEFAULT_TENANT_ID;
  const orgNodeId = cookieStore?.get?.('crmonia_org_node_id')?.value || DEFAULT_ORG_NODE_ID;
  const orgPath = cookieStore?.get?.('crmonia_org_path')?.value || 'root.hq_1.ca_opco';
  const countryCode = (cookieStore?.get?.('crmonia_country')?.value || 'CA') as 'CA' | 'US' | 'GLOBAL';
  const userId = cookieStore?.get?.('crmonia_user_id')?.value || DEFAULT_USER_ID;
  const role = (cookieStore?.get?.('crmonia_role')?.value || 'MAIN_ADMIN') as HierarchicalSessionContext['role'];

  return {
    userId,
    tenantId,
    orgNodeId,
    orgPath,
    countryCode,
    role,
  };
}
