/**
 * Shared helper to validate that a collection exists and belongs to a user.
 */
export async function validateCollectionOwnership(
  db: D1Database,
  collectionId: string,
  userId: string,
): Promise<{ id: string } | null> {
  return db
    .prepare('SELECT id FROM collections WHERE id = ? AND user_id = ?')
    .bind(collectionId, userId)
    .first<{ id: string }>();
}
