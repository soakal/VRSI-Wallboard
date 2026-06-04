import { create } from 'zustand';
import type { AppConfig } from '../types/index';
import type { BoardUser } from '@vrsi/wallboard-shared';

interface AppState {
  isAuthenticated: boolean;
  isSettingsOpen: boolean;
  isFilesOpen: boolean;
  isMonitoringOpen: boolean;
  displayMode: 'day' | 'week' | 'month';
  theme: 'dark' | 'light';
  config: AppConfig | null;
  activeUser: BoardUser | null;
  setIsAuthenticated: (value: boolean) => void;
  setIsSettingsOpen: (value: boolean) => void;
  setIsFilesOpen: (value: boolean) => void;
  setIsMonitoringOpen: (value: boolean) => void;
  setDisplayMode: (mode: 'day' | 'week' | 'month') => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setConfig: (config: AppConfig) => void;
  setActiveUser: (user: BoardUser | null) => void;
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
  theme: 'dark',
  config: null,
  activeUser: getInitialActiveUser(),
  setIsAuthenticated: (value) => set({ isAuthenticated: value }),
  setIsSettingsOpen: (value) => set({ isSettingsOpen: value }),
  setIsFilesOpen: (value) => set({ isFilesOpen: value }),
  setIsMonitoringOpen: (value) => set({ isMonitoringOpen: value }),
  setDisplayMode: (mode) => set({ displayMode: mode }),
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
