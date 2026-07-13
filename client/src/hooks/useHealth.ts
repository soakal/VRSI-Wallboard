import { useQuery } from '@tanstack/react-query';

interface HealthResponse {
  status: string;
  backupStale?: boolean;
  lastBackupAt?: string | null;
  backupInProgress?: boolean;
}

async function getHealth(): Promise<HealthResponse> {
  const r = await fetch('/health');
  if (!r.ok) throw new Error('health request failed');
  return r.json();
}

/** Polls /health for operational signals (backup staleness / backup activity). */
export function useHealth() {
  const q = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    // 30s so a running backup is actually noticed while it is still running.
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  return {
    backupStale: q.data?.backupStale ?? false,
    lastBackupAt: q.data?.lastBackupAt ?? null,
    backupInProgress: q.data?.backupInProgress ?? false,
  };
}
