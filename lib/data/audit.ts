import type { PoolClient } from 'pg';

export async function writeAudit(
  client: PoolClient,
  adminId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
) {
  await client.query(
    `insert into admin_audit_logs(user_id, action, entity_type, entity_id, details)
     values ($1, $2, $3, $4, $5)`,
    [adminId, action, entityType, entityId, details],
  );
}
