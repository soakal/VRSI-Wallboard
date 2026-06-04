import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getConfig, updateConfig } from '../api/configApi';
import { DEFAULT_CONFIG } from '../types/index';

export function useConfig() {
  const q = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    staleTime: 30000,
  });

  return {
    ...q,
    config: q.data ?? DEFAULT_CONFIG,
  };
}

export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });
}
