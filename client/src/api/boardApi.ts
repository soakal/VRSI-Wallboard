import type {
  BoardJob,
  BoardConfig,
  BoardUser,
  Job,
  JobStatus,
  JobNote,
  Actor
} from '@vrsi/wallboard-shared';
import { boardHeaders } from './boardHeaders';
import { unwrap } from './http';

export async function getBoardJobs(): Promise<BoardJob[]> {
  const response = await fetch('/api/board/jobs', { headers: boardHeaders() });
  return unwrap<BoardJob[]>(response);
}

export async function getBoardConfig(): Promise<BoardConfig> {
  const response = await fetch('/api/board/config', { headers: boardHeaders() });
  return unwrap<BoardConfig>(response);
}

export async function updateBoardConfig(partial: Partial<BoardConfig>): Promise<BoardConfig> {
  const response = await fetch('/api/board/config', {
    method: 'POST',
    headers: boardHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(partial)
  });
  return unwrap<BoardConfig>(response);
}

export async function getBoardUsers(): Promise<BoardUser[]> {
  const response = await fetch('/api/board/users', { headers: boardHeaders() });
  return unwrap<BoardUser[]>(response);
}

export interface ImportResult {
  imported: number;
  shippedApplied: number;
  readyToShipApplied: number;
  inProgressApplied: number;
  notesImported: number;
  binderPrintedApplied: number;
  skipped: number;
  warnings: string[];
  rowErrors: string[];
  rowErrorsTotal: number;
}

export async function importJobsJson(jobs: Job[]): Promise<ImportResult> {
  const response = await fetch('/api/board/import', {
    method: 'POST',
    headers: boardHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ jobs })
  });
  return unwrap<ImportResult>(response);
}

export async function importJobsFile(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/board/import', {
    method: 'POST',
    headers: boardHeaders(),
    body: formData
  });
  return unwrap<ImportResult>(response);
}

export async function setJobStatus(
  jobNumber: string,
  status: JobStatus,
  actor: Actor
): Promise<BoardJob> {
  const response = await fetch(`/api/board/jobs/${encodeURIComponent(jobNumber)}/status`, {
    method: 'PATCH',
    headers: boardHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status, actor })
  });
  return unwrap<BoardJob>(response);
}

export async function setJobShipDate(
  jobNumber: string,
  shipDateOverride: string | null,
  actor: Actor,
  shipDateOverrideNote?: string | null,
): Promise<BoardJob> {
  const response = await fetch(`/api/board/jobs/${encodeURIComponent(jobNumber)}/ship-date`, {
    method: 'PATCH',
    headers: boardHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ shipDateOverride, shipDateOverrideNote, actor })
  });
  return unwrap<BoardJob>(response);
}

export async function setJobBinderPrinted(
  jobNumber: string,
  binderPrinted: boolean,
  actor: Actor
): Promise<BoardJob> {
  const response = await fetch(`/api/board/jobs/${encodeURIComponent(jobNumber)}/binder-printed`, {
    method: 'PATCH',
    headers: boardHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ binderPrinted, actor })
  });
  return unwrap<BoardJob>(response);
}

export async function addJobNote(
  jobNumber: string,
  text: string,
  actor: Actor
): Promise<JobNote> {
  const response = await fetch(`/api/board/jobs/${encodeURIComponent(jobNumber)}/notes`, {
    method: 'POST',
    headers: boardHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text, actor })
  });
  return unwrap<JobNote>(response);
}

export type PresenceMap = Record<string, { userId: string; userName: string }[]>

export async function getPresence(): Promise<PresenceMap> {
  const response = await fetch('/api/board/presence', { headers: boardHeaders() });
  return unwrap<PresenceMap>(response);
}

export async function claimPresence(jobNumber: string, userId: string, userName: string): Promise<void> {
  await fetch(`/api/board/presence/${encodeURIComponent(jobNumber)}`, {
    method: 'POST',
    headers: boardHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId, userName }),
  });
}

export async function releasePresence(jobNumber: string, userId: string): Promise<void> {
  await fetch(`/api/board/presence/${encodeURIComponent(jobNumber)}`, {
    method: 'DELETE',
    headers: boardHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId }),
  });
}

export async function updateJobNote(
  jobNumber: string,
  noteId: string,
  text: string,
  actor: Actor
): Promise<JobNote> {
  const response = await fetch(`/api/board/jobs/${encodeURIComponent(jobNumber)}/notes/${encodeURIComponent(noteId)}`, {
    method: 'PATCH',
    headers: boardHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text, actor }),
  });
  return unwrap<JobNote>(response);
}

export async function deleteJobNote(
  jobNumber: string,
  noteId: string,
  actor: Actor
): Promise<void> {
  const response = await fetch(`/api/board/jobs/${encodeURIComponent(jobNumber)}/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
    headers: boardHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ actor })
  });
  await unwrap<{ ok: true }>(response);
}
