/** Headers for /api/board/* when ADMIN_TOKEN is configured on the server. */
export function boardHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = import.meta.env.VITE_ADMIN_TOKEN as string | undefined;
  if (token?.trim()) {
    headers['X-Admin-Token'] = token.trim();
  }
  return headers;
}
