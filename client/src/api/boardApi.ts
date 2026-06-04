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

export async function getBoardJobs(): Promise<BoardJob[]> {
  const response = await fetch('/api/board/jobs', { headers: boardHeaders() });
  if (!response.ok) {
    throw new Error(`Failed to get board jobs: ${response.statusText}`);
  }
  return response.json();
}

export async function getBoardConfig(): Promise<BoardConfig> {
  const response = await fetch('/api/board/config', { headers: boardHeaders() });
  if (!response.ok) {
    throw new Error(`Failed to get board config: ${response.statusText}`);
  }
  return response.json();
}

export async function updateBoardConfig(partial: Partial<BoardConfig>): Promise<BoardConfig> {
  const response = await fetch('/api/board/config', {
    method: 'POST',
    headers: boardHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(partial)
  });
  if (!response.ok) {
    throw new Error(`Failed to update board config: ${response.statusText}`);
  }
  return response.json();
}

export async function getBoardUsers(): Promise<BoardUser[]> {
  const response = await fetch('/api/board/users', { headers: boardHeaders() });
  if (!response.ok) {
    throw new Error(`Failed to get board users: ${response.statusText}`);
  }
  return response.json();
}

export async function importJobsJson(jobs: Job[]): Promise<{ imported: number; shippedApplied: number; readyToShipApplied: number; notesImported: number; skipped: number; warnings: string[]; rowErrors: string[] }> {
  const response = await fetch('/api/board/import', {
    method: 'POST',
    headers: boardHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ jobs })
  });
  if (!response.ok) {
    throw new Error(`Failed to import jobs: ${response.statusText}`);
  }
  return response.json();
}

export async function importJobsFile(file: File): Promise<{ imported: number; shippedApplied: number; readyToShipApplied: number; notesImported: number; skipped: number; warnings: string[]; rowErrors: string[] }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/board/import', {
    method: 'POST',
    headers: boardHeaders(),
    body: formData
  });
  if (!response.ok) {
    throw new Error(`Failed to import jobs file: ${response.statusText}`);
  }
  return response.json();
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
  if (!response.ok) {
    throw new Error(`Failed to set job status: ${response.statusText}`);
  }
  return response.json();
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
  if (!response.ok) {
    throw new Error(`Failed to set job ship date: ${response.statusText}`);
  }
  return response.json();
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
  if (!response.ok) {
    throw new Error(`Failed to set binder printed: ${response.statusText}`);
  }
  return response.json();
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
  if (!response.ok) {
    throw new Error(`Failed to add job note: ${response.statusText}`);
  }
  return response.json();
}

export type PresenceMap = Record<string, { userId: string; userName: string }[]>

export async function getPresence(): Promise<PresenceMap> {
  const response = await fetch('/api/board/presence', { headers: boardHeaders() });
  if (!response.ok) throw new Error('Failed to get presence');
  return response.json();
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

async function boardNoteError(response: Response, fallback: string): Promise<never> {
  let message = fallback
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error) message = body.error
  } catch {
    /* ignore */
  }
  throw new Error(message)
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
  })
  if (!response.ok) {
    await boardNoteError(response, 'Failed to update note')
  }
  return response.json()
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
  if (!response.ok) {
    await boardNoteError(response, 'Failed to delete note')
  }
}
