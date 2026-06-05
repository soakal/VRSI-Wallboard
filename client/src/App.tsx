import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStatus } from './hooks/useAuth';
import { useConfig } from './hooks/useConfig';
import { useEvents } from './hooks/useEvents';
import { useRecentFiles } from './hooks/useRecentFiles';
import { useAppStore } from './store/appStore';
import Dashboard from './components/Dashboard';
import AuthSetup from './components/AuthSetup';
import SettingsPanel from './components/SettingsPanel';
import FileBrowserPanel from './components/FileBrowserPanel';
import MonitoringPanel from './components/MonitoringPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { useBackupOnClose } from './hooks/useBackupOnClose';

const BoardLayout = lazy(() => import('./components/board/BoardLayout'));
const JobListView = lazy(() => import('./components/board/JobListView'));
const UsersView = lazy(() => import('./components/board/UsersView'));
const ImportView = lazy(() => import('./components/board/ImportView'));

function AppInner() {
  const navigate = useNavigate();
  const location = useLocation();

  useBackupOnClose();

  // Auth — always polling
  const { isAuthenticated, needsReauth, isLoading: authLoading } = useAuthStatus(true);

  // Tracks consecutive unauthenticated polls so a brief server restart (which
  // returns 401/unauthenticated for a few seconds) does not bounce us to /setup.
  const unauthCountRef = React.useRef(0);

  // Server config
  const { config } = useConfig();

  // Zustand store
  const {
    isSettingsOpen,
    isFilesOpen,
    isMonitoringOpen,
    displayMode,
    activeUser,
    setIsAuthenticated,
    setIsSettingsOpen,
    setIsFilesOpen,
    setIsMonitoringOpen,
    setDisplayMode,
    setConfig,
  } = useAppStore();

  // Online status
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Data hooks — only active when authenticated
  const { events, dataUpdatedAt, isError: calendarError } = useEvents(
    config.calendarIds,
    isAuthenticated,
    config.refreshInterval,
    displayMode
  );

  const { data: recentFiles, isLoading: recentFilesLoading } = useRecentFiles(
    config.recentFilesCount,
    isAuthenticated && config.showRecentFiles
  );

  // Sync auth state to store and navigate accordingly.
  // Debounce the redirect to /setup: a brief server restart returns
  // unauthenticated for a few seconds, and we don't want to kick a signed-in
  // kiosk back to the device-code screen for a transient blip. Only redirect
  // after 4+ consecutive unauthenticated polls (~12s at the 3s poll interval).
  useEffect(() => {
    if (authLoading) return;
    setIsAuthenticated(isAuthenticated);

    if (isAuthenticated) {
      unauthCountRef.current = 0;
      if (!location.pathname.startsWith('/board')) navigate('/');
      return;
    }

    unauthCountRef.current += 1;
    if (
      (needsReauth || unauthCountRef.current >= 4) &&
      !location.pathname.startsWith('/board')
    ) {
      navigate('/setup');
    }
  }, [isAuthenticated, needsReauth, authLoading, navigate, setIsAuthenticated, location.pathname]);

  // Sync config to store whenever it changes
  useEffect(() => {
    setConfig(config);
  }, [config, setConfig]);

  // Drive the live calendar view from the persisted Calendar View setting.
  // The setting lives in config.displayMode (edited in the Settings panel);
  // keep the store's displayMode in sync so saving the setting takes effect live.
  useEffect(() => {
    setDisplayMode(config.displayMode);
  }, [config.displayMode, setDisplayMode]);

  // Apply dark class to document root
  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        setIsSettingsOpen(!isSettingsOpen);
        return;
      }
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setIsFilesOpen(!isFilesOpen);
        return;
      }
      if (e.ctrlKey && e.key === 'm') {
        e.preventDefault();
        setIsMonitoringOpen(!isMonitoringOpen);
        return;
      }
      if (e.key === 'Escape') {
        setIsSettingsOpen(false);
        setIsFilesOpen(false);
        setIsMonitoringOpen(false);
        return;
      }
      if (e.key === 'd') {
        setDisplayMode('day');
        return;
      }
      if (e.key === 'w') {
        setDisplayMode('week');
        return;
      }
      if (e.key === 'm') {
        setDisplayMode('month');
        return;
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isSettingsOpen, isFilesOpen, isMonitoringOpen, setIsSettingsOpen, setIsFilesOpen, setIsMonitoringOpen, setDisplayMode]);

  // Nightly watchdog — reload at 3am
  useEffect(() => {
    const now = new Date();
    const next3am = new Date(now);
    next3am.setHours(3, 0, 0, 0);
    if (next3am.getTime() <= now.getTime()) {
      next3am.setDate(next3am.getDate() + 1);
    }
    const msUntil3am = next3am.getTime() - now.getTime();
    const timer = setTimeout(() => {
      window.location.reload();
    }, msUntil3am);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Dashboard
                events={events}
                recentFiles={recentFiles ?? []}
                recentFilesLoading={recentFilesLoading}
                config={config}
                isOnline={isOnline}
                dataUpdatedAt={dataUpdatedAt}
                calendarError={calendarError}
                needsReauth={needsReauth}
                displayMode={displayMode}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onOpenFiles={() => setIsFilesOpen(true)}
              />
            ) : (
              <Navigate to="/setup" replace />
            )
          }
        />
        <Route
          path="/setup"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <AuthSetup onAuthenticated={() => setIsAuthenticated(true)} />
            )
          }
        />
        <Route
          path="/board"
          element={
            <Suspense fallback={<div className="min-h-screen bg-[#0f1117]" />}>
              <BoardLayout />
            </Suspense>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={null}>
                <JobListView key={`project-${activeUser?.id ?? 'none'}`} tab="project" />
              </Suspense>
            }
          />
          <Route
            path="spare-parts"
            element={
              <Suspense fallback={null}>
                <JobListView key={`spare-${activeUser?.id ?? 'none'}`} tab="spare-parts" />
              </Suspense>
            }
          />
          <Route
            path="archive"
            element={
              <Suspense fallback={null}>
                <JobListView key={`archive-${activeUser?.id ?? 'none'}`} tab="archive" />
              </Suspense>
            }
          />
          <Route
            path="users"
            element={
              <Suspense fallback={null}>
                <UsersView />
              </Suspense>
            }
          />
          <Route
            path="import"
            element={
              <Suspense fallback={null}>
                <ImportView />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Always-rendered slide-over panels, controlled by store */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
      />
      <FileBrowserPanel
        isOpen={isFilesOpen}
        onClose={() => setIsFilesOpen(false)}
        fileOpenMode={config.fileOpenMode}
      />
      <MonitoringPanel
        isOpen={isMonitoringOpen}
        onClose={() => setIsMonitoringOpen(false)}
      />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

export default App;
