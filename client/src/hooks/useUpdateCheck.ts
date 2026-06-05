import { useEffect, useState } from 'react';

export interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion?: string;
  latestVersion?: string;
  releaseUrl?: string;
  releaseName?: string;
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
