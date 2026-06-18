export type JobStatus = 'none' | 'parts_on_order' | 'design' | 'build' | 'in_progress' | 'ready_to_ship' | 'shipped';
export const STATUS_ORDER: JobStatus[] = ['none', 'parts_on_order', 'design', 'build', 'in_progress', 'ready_to_ship', 'shipped'];

export interface Job {
  jobNumber: string;
  /** Human-readable job description/title from the ops schedule. */
  description?: string;
  pm: string;
  customer: string;
  materialsManager: string;
  pabsComplete: string | null;
  shipToPm: string | null;
  shipToCustomer: string | null;
}

export const OPS_SCHEDULE_NOTE_AUTHOR_ID = 'system:ops-schedule';
export const OPS_SCHEDULE_NOTE_AUTHOR_NAME = 'Ops Schedule';

export interface JobNote {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

export interface JobState {
  status: JobStatus;
  shipDateOverride: string | null;
  shipDateOverrideNote: string | null;
  binderPrinted: boolean;
  /** True once a user sets the status by hand — import never overwrites a locked status. */
  statusManual?: boolean;
  /** True once a user toggles the binder checkbox by hand — import never overwrites it. */
  binderManual?: boolean;
  /** Manual triage flag — a blocked job shows only in the Blocked tab. Never set/cleared by import. */
  blocked?: boolean;
  /** ISO timestamp when the job was blocked (null when not blocked). */
  blockedAt?: string | null;
  /** Short reason the job is blocked (e.g. "waiting on parts"). */
  blockedReason?: string | null;
  version: number;
  notes: JobNote[];
  updatedAt: string;
  updatedBy?: string;
}

export interface BoardJob extends Job {
  status: JobStatus;
  binderPrinted: boolean;
  notes: JobNote[];
  effectiveShipDate: string | null;
  originalShipDate: string | null;
  shipDateOverridden: boolean;
  shipDateOverrideNote: string | null;
  isNew: boolean;
  /** True when the latest import added or changed this job's Ops Schedule note. */
  hasNewNote: boolean;
  /** Manual triage flag — a blocked job shows only in the Blocked tab. */
  blocked: boolean;
  /** Short reason the job is blocked (null when not blocked). */
  blockedReason: string | null;
}

export interface BoardUser {
  id: string;
  name: string;
  role: 'pm' | 'materials' | 'super' | 'manual';
}

export interface BoardConfig {
  spareCarrier: string;
  superUsers: string[];
  statusColors: Record<JobStatus, string>;
  extraUsers: string[];
}

export interface Actor {
  id: string;
  name: string;
}

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  spareCarrier: 'matto@vrs-inc.com',
  superUsers: [],
  statusColors: {
    none: '#475569',
    parts_on_order: '#f97316',
    design: '#a855f7',
    build: '#14b8a6',
    in_progress: '#facc15',
    ready_to_ship: '#3b82f6',
    shipped: '#22c55e',
  },
  extraUsers: [],
};

export interface JobFilter {
  pm?: string[];
  materialsManager?: string[];
}

export interface ImportResult {
  imported: number;
  newJobNumbers: string[];
  warnings: string[];
  errors: string[];
}
