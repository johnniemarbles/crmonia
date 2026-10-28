import { NextRequest } from 'next/server';
import { HierarchicalSessionContext } from '@crmonia/db/rls-session';

const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const DEFAULT_ORG_NODE_ID = '00000000-0000-4000-8000-000000000010';
const DEFAULT_USER_ID = '00000000-0000-4000-8000-000000000099';

export async function getAuthenticatedHierarchyContext(
  req: NextRequest
): Promise<HierarchicalSessionContext> {
  // Support header-based context (from gateways / microservices / extension)
  const tenantId = req.headers.get('x-crmonia-tenant-id') || DEFAULT_TENANT_ID;
  const orgNodeId = req.headers.get('x-crmonia-org-node-id') || DEFAULT_ORG_NODE_ID;
  const orgPath = req.headers.get('x-crmonia-org-path') || 'root.hq_1.ca_opco';
  const countryCode = (req.headers.get('x-crmonia-country') || 'CA') as 'CA' | 'US' | 'GLOBAL';
  const userId = req.headers.get('x-crmonia-user-id') || DEFAULT_USER_ID;
  const role = (req.headers.get('x-crmonia-role') || 'MAIN_ADMIN') as HierarchicalSessionContext['role'];

  return {
    userId,
    tenantId,
    orgNodeId,
    orgPath,
    countryCode,
    role,
  };
}
