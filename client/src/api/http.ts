export async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (body?.error?.message as string | undefined) ??
      (body?.error as string | undefined) ??
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return (body as { data: T }).data;
}

/** Abort board API calls that get no response in time. Without this, a hung
 * server leaves a save request pending FOREVER — the card shows "Applying…"
 * indefinitely and the user never learns the save did not happen. 15s is
 * generous for a localhost kiosk API. */
const BOARD_FETCH_TIMEOUT_MS = 15_000;

export async function boardFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(BOARD_FETCH_TIMEOUT_MS) });
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error('The board server is not responding — the change was NOT saved.');
    }
    throw new Error('Could not reach the board server — the change was NOT saved.');
  }
}
