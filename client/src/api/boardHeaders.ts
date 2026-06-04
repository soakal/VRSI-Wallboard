/** Headers for /api/board/* requests. The kiosk browser runs on localhost,
 *  which the server allows through without a token (see requireAdminToken). */
export function boardHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...extra };
}
