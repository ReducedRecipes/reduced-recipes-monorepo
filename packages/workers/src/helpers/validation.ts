/**
 * Validates that a body contains a non-empty string `name` field.
 * Returns the trimmed name on success, or null if invalid.
 */
export function validateName(body: { name?: unknown }): string | null {
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return null;
  }
  return body.name.trim();
}
