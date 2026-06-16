import { useQuery } from '@tanstack/react-query';

interface HealthResponse {
  status: string;
  backupStale?: boolean;
  lastBackupAt?: string | null;
}

async function getHealth(): Promise<HealthResponse> {
  const r = await fetch('/health');
  if (!r.ok) throw new Error('health request failed');
  return r.json();
}

/** Polls /health for operational signals (currently backup staleness). */
export function useHealth() {
  const q = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return {
    backupStale: q.data?.backupStale ?? false,
    lastBackupAt: q.data?.lastBackupAt ?? null,
  };
}
