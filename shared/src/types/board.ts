export type JobStatus = 'none' | 'in_progress' | 'ready_to_ship' | 'shipped';
export const STATUS_ORDER: JobStatus[] = ['none', 'in_progress', 'ready_to_ship', 'shipped'];

export interface Job {
  jobNumber: string;
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
}

export interface BoardUser {
  id: string;
  name: string;
  role: 'pm' | 'materials' | 'super' | 'manual';
}

export interface BoardConfig {
  spareCarrier: string;
  superUser: string;
  statusColors: Record<JobStatus, string>;
  extraUsers: string[];
}

export interface Actor {
  id: string;
  name: string;
}

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  spareCarrier: 'matto@vrs-inc.com',
  superUser: 'Jon Shantry',
  statusColors: {
    none: '#475569',
    in_progress: '#facc15',
    ready_to_ship: '#3b82f6',
    shipped: '#22c55e',
  },
  extraUsers: [],
};

export interface Actor {
  id: string;
  name: string;
}

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
