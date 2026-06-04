import React, { useState, useEffect, useCallback } from 'react';
import { SharePointSite, SharePointDrive, SharePointFile } from '../types/index';
import FileIcon from './FileIcon';

interface FileBrowserPanelProps {
  isOpen: boolean;
  onClose: () => void;
  fileOpenMode: 'same-window' | 'new-window';
}

type ViewLevel = 'sites' | 'drives' | 'files';

interface BreadcrumbEntry {
  label: string;
  level: ViewLevel;
}

const FileBrowserPanel: React.FC<FileBrowserPanelProps> = ({ isOpen, onClose, fileOpenMode }) => {
  const [view, setView] = useState<ViewLevel>('sites');
  const [sites, setSites] = useState<SharePointSite[]>([]);
  const [drives, setDrives] = useState<SharePointDrive[]>([]);
  const [files, setFiles] = useState<SharePointFile[]>([]);
  const [selectedSite, setSelectedSite] = useState<SharePointSite | null>(null);
  const [selectedDrive, setSelectedDrive] = useState<SharePointDrive | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when panel opens
  useEffect(() => {
    if (isOpen) {
      setView('sites');
      setSelectedSite(null);
      setSelectedDrive(null);
      setSites([]);
      setDrives([]);
      setFiles([]);
      setError(null);
      loadSites();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const loadSites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sharepoint/sites');
      if (!res.ok) throw new Error(`Failed to load sites (${res.status})`);
      const data: SharePointSite[] = await res.json();
      setSites(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sites');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDrives = useCallback(async (site: SharePointSite) => {
    setLoading(true);
    setError(null);
    setSelectedSite(site);
    try {
      const res = await fetch(`/api/sharepoint/sites/${encodeURIComponent(site.id)}/drives`);
      if (!res.ok) throw new Error(`Failed to load drives (${res.status})`);
      const data: SharePointDrive[] = await res.json();
      setDrives(data);
      setView('drives');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drives');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFiles = useCallback(async (drive: SharePointDrive) => {
    if (!selectedSite) return;
    setLoading(true);
    setError(null);
    setSelectedDrive(drive);
    try {
      const res = await fetch(
        `/api/sharepoint/sites/${encodeURIComponent(selectedSite.id)}/drives/${encodeURIComponent(drive.id)}/files`
      );
      if (!res.ok) throw new Error(`Failed to load files (${res.status})`);
      const data: SharePointFile[] = await res.json();
      setFiles(data);
      setView('files');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  const goBack = () => {
    if (view === 'files') {
      setView('drives');
      setFiles([]);
      setSelectedDrive(null);
    } else if (view === 'drives') {
      setView('sites');
      setDrives([]);
      setSelectedSite(null);
    }
  };

  const openFile = (file: SharePointFile) => {
    if (fileOpenMode === 'new-window') {
      window.open(file.webUrl, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = file.webUrl;
    }
  };

  const getBreadcrumb = (): BreadcrumbEntry[] => {
    const crumbs: BreadcrumbEntry[] = [{ label: 'Sites', level: 'sites' }];
    if (selectedSite) crumbs.push({ label: selectedSite.displayName, level: 'drives' });
    if (selectedDrive) crumbs.push({ label: selectedDrive.name, level: 'files' });
    return crumbs;
  };

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function timeAgo(isoString: string): string {
    const then = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - then.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 1) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ zIndex: 59 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 bottom-0 w-full md:w-96 bg-[#161b27] border-l border-white/10 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ zIndex: 60 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            {view !== 'sites' && (
              <button
                type="button"
                onClick={goBack}
                className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Go back"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="text-base font-semibold text-white">SharePoint Files</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-5 py-2 border-b border-white/5 flex-shrink-0 overflow-x-auto">
          {getBreadcrumb().map((crumb, i, arr) => (
            <React.Fragment key={crumb.level}>
              <span
                className={`text-xs whitespace-nowrap ${
                  i === arr.length - 1 ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {crumb.label}
              </span>
              {i < arr.length - 1 && (
                <svg className="h-3 w-3 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* Loading */}
          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-white/10 border-t-blue-500" />
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="rounded-lg bg-red-900/30 border border-red-700/30 p-4 text-center space-y-3">
              <p className="text-sm text-red-300">{error}</p>
              <button
                type="button"
                onClick={() => {
                  if (view === 'sites') loadSites();
                  else if (view === 'drives' && selectedSite) loadDrives(selectedSite);
                  else if (view === 'files' && selectedDrive) loadFiles(selectedDrive);
                }}
                className="text-xs text-blue-400 hover:text-blue-300 underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Sites */}
          {!loading && !error && view === 'sites' && (
            <div className="space-y-1">
              {sites.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">No sites found.</p>
              )}
              {sites.map((site) => (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => loadDrives(site)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 min-h-[48px] text-left hover:bg-white/5 transition-colors group"
                >
                  <svg className="h-5 w-5 text-slate-400 group-hover:text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200 group-hover:text-white truncate">
                      {site.displayName}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">{site.name}</p>
                  </div>
                  <svg className="h-4 w-4 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Drives */}
          {!loading && !error && view === 'drives' && (
            <div className="space-y-1">
              {drives.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">No document libraries found.</p>
              )}
              {drives.map((drive) => (
                <button
                  key={drive.id}
                  type="button"
                  onClick={() => loadFiles(drive)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 min-h-[48px] text-left hover:bg-white/5 transition-colors group"
                >
                  <svg className="h-5 w-5 text-slate-400 group-hover:text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200 group-hover:text-white truncate">
                      {drive.name}
                    </p>
                    <p className="text-[11px] text-slate-500 capitalize">{drive.driveType}</p>
                  </div>
                  <svg className="h-4 w-4 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Files */}
          {!loading && !error && view === 'files' && (
            <div className="space-y-1">
              {files.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">No files found.</p>
              )}
              {files.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => openFile(file)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 min-h-[48px] text-left hover:bg-white/5 transition-colors group"
                >
                  <FileIcon mimeType={file.mimeType} fileName={file.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {timeAgo(file.lastModifiedDateTime)} · {formatSize(file.size)}
                    </p>
                  </div>
                  <svg className="h-3.5 w-3.5 text-slate-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default FileBrowserPanel;
