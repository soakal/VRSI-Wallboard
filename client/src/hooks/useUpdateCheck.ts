import { useEffect, useState } from 'react';

export interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion?: string;
  /** Release page for the version currently running (always present) */
  currentReleaseUrl?: string;
  latestVersion?: string;
  /** Release page for the latest available release (from the GitHub check) */
  releaseUrl?: string;
  releaseName?: string;
}

/** Outcome of the last update run, written by the PS updater (GET /api/update/status). */
export interface UpdateStatus {
  ok: boolean;
  message: string;
  /** ISO 8601 timestamp the updater wrote the outcome */
  at: string;
  fromVersion?: string;
  toVersion?: string;
}

/**
 * Read the last update outcome. Returns null when there is no status, the
 * request fails, or the payload is malformed. Callers compare `at` against the
 * moment they kicked off the update so a STALE failure from a prior run is
 * never mistaken for the current one.
 */
export async function fetchUpdateStatus(): Promise<UpdateStatus | null> {
  try {
    const res = await fetch('/api/update/status');
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (json === null || typeof json !== 'object' || !('data' in json)) return null;
    const d = (json as { data?: unknown }).data;
    if (
      d !== null && typeof d === 'object' &&
      'ok' in d && typeof (d as Record<string, unknown>).ok === 'boolean' &&
      'message' in d && typeof (d as Record<string, unknown>).message === 'string' &&
      'at' in d && typeof (d as Record<string, unknown>).at === 'string'
    ) {
      return d as UpdateStatus;
    }
    return null;
  } catch {
    return null;
  }
}

function isUpdateInfo(v: unknown): v is { data: UpdateInfo } {
  if (v === null || typeof v !== 'object' || !('data' in v)) return false;
  const d = (v as Record<string, unknown>).data;
  return d !== null && typeof d === 'object' && 'updateAvailable' in d;
}

export function useUpdateCheck(): UpdateInfo {
  const [info, setInfo] = useState<UpdateInfo>({ updateAvailable: false });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch('/api/update/check');
        if (!res.ok || cancelled) return;
        const json: unknown = await res.json();
        if (!cancelled && isUpdateInfo(json)) setInfo(json.data);
      } catch {
        // Network error — stay silent
      }
    }

    void check();
    const id = setInterval(() => { void check(); }, 6 * 60 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return info;
}
