import { useQuery } from '@tanstack/react-query';
import { getRecentFiles } from '../api/sharepointApi';
import type { SharePointFile } from '../types/index';

export function useRecentFiles(
  count: number,
  enabled: boolean
): { data: SharePointFile[] | undefined; isLoading: boolean; error: Error | null } {
  const q = useQuery({
    queryKey: ['recent-files', count],
    queryFn: () => getRecentFiles(count),
    enabled,
    refetchInterval: 300000,
  });

  return {
    data: q.data,
    isLoading: q.isLoading,
    error: q.error as Error | null,
  };
}
