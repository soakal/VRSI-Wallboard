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
