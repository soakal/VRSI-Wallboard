import { useQuery } from '@tanstack/react-query';
import { getAuthStatus } from '../api/authApi';

export function useAuthStatus(poll = true) {
  const q = useQuery({
    queryKey: ['auth-status'],
    queryFn: getAuthStatus,
    refetchInterval: (query) => {
      if (!poll) return false;
      const data = query.state.data;
      if (data?.authenticated && !data?.needsReauth) return 60000;
      return 3000;
    },
    staleTime: 0,
  });

  // Return only the fields callers use. Spreading `...q` accessed every tracked
  // field (isFetching, dataUpdatedAt, …), so the consumer re-rendered on every
  // 3s poll — which re-created inline callbacks and restarted the auth flow.
  return {
    isAuthenticated: q.data?.authenticated ?? false,
    needsReauth: q.data?.needsReauth ?? false,
    isLoading: q.isLoading,
  };
}
