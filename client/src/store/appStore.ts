import { create } from 'zustand';
import type { AppConfig } from '../types/index';
import type { BoardUser } from '@vrsi/wallboard-shared';

interface AppState {
  isAuthenticated: boolean;
  isSettingsOpen: boolean;
  isFilesOpen: boolean;
  isMonitoringOpen: boolean;
  displayMode: 'day' | 'week' | 'month';
  /** Date the calendar is showing — navigated with the ‹ › / Today controls */
  viewDate: Date;
  theme: 'dark' | 'light';
  config: AppConfig | null;
  activeUser: BoardUser | null;
  /** Job numbers with un-applied edits (pending status/date/note drafts) */
  dirtyJobs: Record<string, true>;
  setIsAuthenticated: (value: boolean) => void;
  setIsSettingsOpen: (value: boolean) => void;
  setIsFilesOpen: (value: boolean) => void;
  setIsMonitoringOpen: (value: boolean) => void;
  setDisplayMode: (mode: 'day' | 'week' | 'month') => void;
  setViewDate: (date: Date) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setConfig: (config: AppConfig) => void;
  setActiveUser: (user: BoardUser | null) => void;
  setJobDirty: (jobNumber: string, dirty: boolean) => void;
}

// Initialize activeUser from localStorage
const getInitialActiveUser = (): BoardUser | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const savedId = localStorage.getItem('nexus.activeUserId');
  const savedName = localStorage.getItem('nexus.activeUserName');
  const savedRole = localStorage.getItem('nexus.activeUserRole');

  if (savedId && savedName && savedRole) {
    return {
      id: savedId,
      name: savedName,
      role: savedRole as BoardUser['role']
    };
  }
  return null;
};

export const useAppStore = create<AppState>((set) => ({
  isAuthenticated: false,
  isSettingsOpen: false,
  isFilesOpen: false,
  isMonitoringOpen: false,
  displayMode: 'month',
  viewDate: new Date(),
  theme: 'dark',
  config: null,
  activeUser: getInitialActiveUser(),
  dirtyJobs: {},
  setJobDirty: (jobNumber, dirty) =>
    set((state) => {
      const has = !!state.dirtyJobs[jobNumber];
      if (dirty === has) return {};
      const next = { ...state.dirtyJobs };
      if (dirty) next[jobNumber] = true;
      else delete next[jobNumber];
      return { dirtyJobs: next };
    }),
  setIsAuthenticated: (value) => set({ isAuthenticated: value }),
  setIsSettingsOpen: (value) => set({ isSettingsOpen: value }),
  setIsFilesOpen: (value) => set({ isFilesOpen: value }),
  setIsMonitoringOpen: (value) => set({ isMonitoringOpen: value }),
  setDisplayMode: (mode) => set({ displayMode: mode }),
  setViewDate: (date) => set({ viewDate: date }),
  setTheme: (theme) => set({ theme: theme }),
  setConfig: (config) => set({ config: config }),
  setActiveUser: (user) => {
    if (user !== null) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('nexus.activeUserId', user.id);
        localStorage.setItem('nexus.activeUserName', user.name);
        localStorage.setItem('nexus.activeUserRole', user.role);
      }
    } else {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('nexus.activeUserId');
        localStorage.removeItem('nexus.activeUserName');
        localStorage.removeItem('nexus.activeUserRole');
      }
    }
    set({ activeUser: user });
  }
}));

/**
 * Returns true when it is OK to navigate away. When any job card has
 * un-applied edits, asks the user to confirm losing them first.
 */
export function confirmDiscardUnsaved(): boolean {
  const count = Object.keys(useAppStore.getState().dirtyJobs).length;
  if (count === 0) return true;
  return window.confirm(
    `You have unsaved changes on ${count} job${count === 1 ? '' : 's'} that you have not applied.\n\n` +
      'If you leave now those changes will NOT be saved. Leave anyway?',
  );
}
