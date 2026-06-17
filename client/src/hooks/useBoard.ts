import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBoardJobs,
  getBoardConfig,
  updateBoardConfig,
  getBoardUsers,
  importJobsFile,
  importJobsJson,
  setJobStatus,
  setJobShipDate,
  setJobBinderPrinted,
  setJobBlocked,
  addJobNote,
  updateJobNote,
  deleteJobNote,
  getPresence,
  type PresenceMap,
} from '../api/boardApi';
import { DEFAULT_BOARD_CONFIG, Job, JobStatus, Actor } from '@vrsi/wallboard-shared';

export function useBoardJobs() {
  const q = useQuery({
    queryKey: ['board', 'jobs'],
    queryFn: getBoardJobs,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  return {
    jobs: q.data ?? [],
    isLoading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  };
}

export function useBoardConfig() {
  const q = useQuery({
    queryKey: ['board', 'config'],
    queryFn: getBoardConfig,
    staleTime: 60000,
  });

  return {
    config: q.data ?? DEFAULT_BOARD_CONFIG,
    isLoading: q.isLoading,
  };
}

export function useUpdateBoardConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateBoardConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', 'config'] }),
  });
}

export function useBoardUsers() {
  const q = useQuery({
    queryKey: ['board', 'users'],
    queryFn: getBoardUsers,
    staleTime: 60000,
  });

  return {
    users: q.data ?? [],
    isLoading: q.isLoading,
  };
}

export function useImportJobs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (arg: File | Job[]) => {
      if (arg instanceof File) {
        return importJobsFile(arg);
      }
      return importJobsJson(arg);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useSetJobStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobNumber, status, actor }: { jobNumber: string; status: JobStatus; actor: Actor }) =>
      setJobStatus(jobNumber, status, actor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', 'jobs'] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useSetJobShipDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobNumber,
      shipDateOverride,
      shipDateOverrideNote,
      actor,
    }: {
      jobNumber: string
      shipDateOverride: string | null
      shipDateOverrideNote?: string | null
      actor: Actor
    }) => setJobShipDate(jobNumber, shipDateOverride, actor, shipDateOverrideNote),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', 'jobs'] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useSetJobBinderPrinted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobNumber,
      binderPrinted,
      actor,
    }: {
      jobNumber: string
      binderPrinted: boolean
      actor: Actor
    }) => setJobBinderPrinted(jobNumber, binderPrinted, actor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', 'jobs'] });
    },
  });
}

export function useSetJobBlocked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobNumber,
      blocked,
      reason,
      actor,
    }: {
      jobNumber: string
      blocked: boolean
      reason: string | null
      actor: Actor
    }) => setJobBlocked(jobNumber, blocked, reason, actor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', 'jobs'] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useAddJobNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobNumber, text, actor }: { jobNumber: string; text: string; actor: Actor }) =>
      addJobNote(jobNumber, text, actor),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', 'jobs'] }),
    onError: () => { /* error surfaced via mutation.isError at call site */ },
  });
}

export function usePresence(): PresenceMap {
  const q = useQuery({
    queryKey: ['board', 'presence'],
    queryFn: getPresence,
    refetchInterval: 10000,
    staleTime: 0,
  });
  return q.data ?? {};
}

export function useUpdateJobNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobNumber,
      noteId,
      text,
      actor,
    }: {
      jobNumber: string
      noteId: string
      text: string
      actor: Actor
    }) => updateJobNote(jobNumber, noteId, text, actor),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', 'jobs'] }),
  });
}

export function useDeleteJobNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobNumber, noteId, actor }: { jobNumber: string; noteId: string; actor: Actor }) =>
      deleteJobNote(jobNumber, noteId, actor),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', 'jobs'] }),
  });
}
