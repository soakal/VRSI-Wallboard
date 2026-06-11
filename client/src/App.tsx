import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStatus } from './hooks/useAuth';
import { useConfig } from './hooks/useConfig';
import { useEvents } from './hooks/useEvents';
import { useRecentFiles } from './hooks/useRecentFiles';
import { useBoardUsers } from './hooks/useBoard';
import { useAppStore } from './store/appStore';
import Dashboard from './components/Dashboard';
import AuthSetup from './components/AuthSetup';
import SettingsPanel from './components/SettingsPanel';
import FileBrowserPanel from './components/FileBrowserPanel';
import MonitoringPanel from './components/MonitoringPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { useBackupOnClose } from './hooks/useBackupOnClose';
import { useUpdateCheck } from './hooks/useUpdateCheck';

const BoardLayout = lazy(() => import('./components/board/BoardLayout'));
const JobListView = lazy(() => import('./components/board/JobListView'));
const UsersView = lazy(() => import('./components/board/UsersView'));
const ImportView = lazy(() => import('./components/board/ImportView'));

function AppInner() {
  const navigate = useNavigate();
  const location = useLocation();

  useBackupOnClose();
  const updateInfo = useUpdateCheck();
  const [updateDismissed, setUpdateDismissed] = useState(false);

  // Resume version polling if Settings was closed before the update-triggered reload.
  useEffect(() => {
    const raw = localStorage.getItem("vrsi_update_pending");
    if (!raw) return;
    let fromVersion: string | undefined;
    let startedAt = 0;
    try {
      const parsed = JSON.parse(raw) as { fromVersion?: string; startedAt?: number };
      fromVersion = parsed.fromVersion;
      startedAt = parsed.startedAt ?? 0;
    } catch { localStorage.removeItem("vrsi_update_pending"); return; }
    // Clear stale flags (> 15 min old — update either finished or failed)
    if (Date.now() - startedAt > 15 * 60 * 1000) { localStorage.removeItem("vrsi_update_pending"); return; }
    const id = window.setInterval(async () => {
      try {
        const r = await fetch("/api/update/check");
        if (!r.ok) return;
        const j: unknown = await r.json();
        if (j !== null && typeof j === "object" && "data" in j) {
          const d = (j as { data?: { currentVersion?: string } }).data;
          if (d && typeof d.currentVersion === "string" && d.currentVersion !== fromVersion) {
            window.clearInterval(id);
            localStorage.removeItem("vrsi_update_pending");
            window.location.reload();
          }
        }
      } catch { /* server down mid-update — keep polling */ }
    }, 10_000);
    return () => window.clearInterval(id);
  }, []);

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
    setActiveUser,
  } = useAppStore();

  // Re-sync the persisted active user against the live users list — roles and
  // names change as jobs import/ship, and a stale localStorage role breaks
  // per-user filtering until the next manual re-selection.
  const { users: boardUsers } = useBoardUsers();
  useEffect(() => {
    if (!activeUser || boardUsers.length === 0) return;
    const fresh = boardUsers.find((u) => u.id === activeUser.id);
    if (fresh && (fresh.role !== activeUser.role || fresh.name !== activeUser.name)) {
      setActiveUser(fresh);
    }
  }, [boardUsers, activeUser, setActiveUser]);

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
        if (config.showFiles) setIsFilesOpen(!isFilesOpen);
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
  }, [isSettingsOpen, isFilesOpen, isMonitoringOpen, setIsSettingsOpen, setIsFilesOpen, setIsMonitoringOpen, setDisplayMode, config.showFiles]);

  // Close the file browser if Files gets disabled in Settings while it is open
  useEffect(() => {
    if (!config.showFiles) setIsFilesOpen(false);
  }, [config.showFiles, setIsFilesOpen]);

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

  const showUpdateBanner = updateInfo.updateAvailable && !updateDismissed;

  return (
    <>
      {showUpdateBanner && (
        <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 bg-blue-600 px-4 py-2 text-sm text-white shadow-lg">
          <span>
            Update available: <strong>{updateInfo.releaseName || updateInfo.latestVersion}</strong>
            {' '}— you are on v{updateInfo.currentVersion}. Open{' '}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="underline font-medium hover:text-blue-200"
            >
              Settings → About &amp; Updates
            </button>
            {' '}and click Update.
            {updateInfo.releaseUrl && (
              <a
                href={updateInfo.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-2 underline hover:text-blue-200"
              >
                Release notes
              </a>
            )}
          </span>
          <button
            type="button"
            onClick={() => setUpdateDismissed(true)}
            className="flex-shrink-0 rounded px-2 py-0.5 text-xs hover:bg-blue-700 transition-colors"
            aria-label="Dismiss update notification"
          >
            ✕ Dismiss
          </button>
        </div>
      )}
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
      {config.showFiles && (
        <FileBrowserPanel
          isOpen={isFilesOpen}
          onClose={() => setIsFilesOpen(false)}
          fileOpenMode={config.fileOpenMode}
        />
      )}
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
