import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRlsTransaction } from '@crmonia/db/rls-session';
import { getAuthenticatedHierarchyContext } from '@/lib/auth/session-context';

const MoveEntityRequestSchema = z.object({
  nodeId: z.string().uuid(),
  newParentId: z.string().uuid(),
  action: z.enum(['PREVIEW', 'EXECUTE']),
  allowCrossBorder: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedHierarchyContext(req);

    // Only Enterprise Admins or Country Admins can reorganize hierarchy trees
    if (!['MAIN_ADMIN', 'COUNTRY_ADMIN'].includes(session.role)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Only Main Admins or Country Admins can restructure organizational nodes.' },
        { status: 403 }
      );
    }

    const rawBody = await req.json();
    const parsed = MoveEntityRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
        { status: 422 }
      );
    }
    const { nodeId, newParentId, action, allowCrossBorder } = parsed.data;

    const result = await withRlsTransaction(session, async (client) => {
      if (action === 'PREVIEW') {
        const { rows } = await client.query<{ preview: unknown }>(
          `SELECT platform.preview_move_org_node_subtree($1::uuid, $2::uuid) AS preview`,
          [nodeId, newParentId]
        );
        return rows[0]?.preview;
      } else {
        const { rows } = await client.query<{ result: unknown }>(
          `SELECT platform.move_org_node_subtree($1::uuid, $2::uuid, $3::uuid, $4::boolean) AS result`,
          [nodeId, newParentId, session.userId, allowCrossBorder]
        );
        return rows[0]?.result;
      }
    });

    return NextResponse.json({
      status: action === 'PREVIEW' ? 'PREVIEW_GENERATED' : 'SUBTREE_MOVED',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Hierarchy operation failed';
    return NextResponse.json({ error: 'STRUCTURE_OPERATION_FAILED', message }, { status: 400 });
  }
}
