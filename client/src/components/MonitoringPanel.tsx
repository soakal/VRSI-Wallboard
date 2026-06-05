import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchAuditLog,
  fetchBackups,
  fetchSecurityReport,
  restoreBackup,
  RestoreConflictError,
  runBackupNow,
  type AuditEntry,
  type BackupFile,
  type BackupsResponse,
  type SecurityReport,
} from '../api/storageApi';

interface MonitoringPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'it' | 'backup' | 'activity';

function isFetchFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed');
}

const MonitoringPanel: React.FC<MonitoringPanelProps> = ({ isOpen, onClose }) => {
  const [tab, setTab] = useState<Tab>('backup');
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [backupsInfo, setBackupsInfo] = useState<BackupsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setReportError(null);
    setAuditError(null);
    setBackupError(null);

    const [reportRes, auditRes, backupRes] = await Promise.allSettled([
      fetchSecurityReport(),
      fetchAuditLog(300),
      fetchBackups(),
    ]);

    if (reportRes.status === 'fulfilled') {
      setReport(reportRes.value);
    } else {
      setReport(null);
      const err = reportRes.reason;
      setReportError(
        isFetchFailure(err)
          ? 'Cannot reach the server. Start the WallBoard server (port 3001), then click Refresh.'
          : err instanceof Error
            ? err.message
            : 'Failed to load security report'
      );
    }

    if (auditRes.status === 'fulfilled') {
      setEntries(auditRes.value);
    } else {
      setEntries([]);
      const err = auditRes.reason;
      if (!isFetchFailure(err)) {
        setAuditError(err instanceof Error ? err.message : 'Failed to load activity log');
      }
    }

    if (backupRes.status === 'fulfilled') {
      setBackupsInfo(backupRes.value);
    } else {
      setBackupsInfo(null);
      const err = backupRes.reason;
      setBackupError(
        isFetchFailure(err)
          ? 'Cannot reach the server. Start the WallBoard server (port 3001), then click Refresh.'
          : err instanceof Error
            ? err.message
            : 'Failed to list backups'
      );
    }

    setLoading(false);
  }, []);

  const handleBackupNow = async () => {
    setBackupBusy(true);
    setBackupError(null);
    try {
      await runBackupNow();
      await load();
      setTab('backup');
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestore = async (b: BackupFile) => {
    const mb = (b.sizeBytes / (1024 * 1024)).toFixed(2);
    const ok = window.confirm(
      `Restore from this backup?\n\n${b.file}\n${new Date(b.createdAt).toLocaleString()}\n${mb} MB\n\nYour current database will be saved as a pre-restore backup first. The page will reload.\n\nTip: If restore fails, try again or pick a wallboard-pre-restore-*.db file (saved right before the last restore attempt).`
    );
    if (!ok) return;
    setBackupBusy(true);
    setBackupError(null);
    try {
      await restoreBackup(b.file);
      window.location.reload();
    } catch (err) {
      if (err instanceof RestoreConflictError) {
        const sample = err.conflicts
          .slice(0, 3)
          .map((c) => `${c.jobNumber} (backup v${c.backup.version}, live v${c.live.version})`)
          .join('; ');
        setBackupError(
          `${err.message}${sample ? ` Conflicts: ${sample}.` : ''} Use the Activity log for details.`
        );
      } else {
        setBackupError(err instanceof Error ? err.message : 'Restore failed');
      }
    } finally {
      setBackupBusy(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const filtered = entries.filter((row) => filter === 'all' || row.type === filter);

  const exportForIt = () => {
    if (!report) return;
    const lines = [
      'VRSI WallBoard — Security & Activity Report',
      `Generated: ${report.generatedAt}`,
      '',
      '--- Safety summary ---',
      ...report.safetySummary.map((s) => `• ${s}`),
      '',
      '--- Data locations ---',
      `Database: ${report.databaseFile}`,
      `Backups: ${report.backupDirectory}`,
      `Server logs: ${report.logDirectory}`,
      `Mode: ${report.standaloneMode ? 'Standalone (local)' : 'Azure-enabled'}`,
      '',
      '--- Audit counts ---',
      ...report.auditCountsByType.map((c) => `${c.type}: ${c.count}`),
      '',
      '--- External hosts (from network audit) ---',
      ...(report.externalHostsContacted.length
        ? report.externalHostsContacted.map((h) => `• ${h}`)
        : ['• (none recorded)']),
      '',
      '--- Recent activity ---',
      ...filtered.slice(0, 100).map(
        (e) => `${e.timestamp}  [${e.type}]  ${e.detail}${e.success === 0 || e.success === false ? ' (failed)' : ''}`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vrsi-wallboard-it-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} aria-hidden />
      <aside className="fixed right-0 top-0 h-full w-full max-w-xl z-50 bg-[#13171f] border-l border-slate-800 shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">System &amp; IT Report</h2>
            <p className="text-[11px] text-slate-500">Backups, audit log, safety summary</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex gap-1 px-4 pt-3 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setTab('it')}
            className={`px-3 py-1.5 text-xs rounded-t font-medium ${tab === 'it' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            IT safety summary
          </button>
          <button
            type="button"
            onClick={() => setTab('backup')}
            className={`px-3 py-1.5 text-xs rounded-t font-medium ${tab === 'backup' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Backup &amp; restore
          </button>
          <button
            type="button"
            onClick={() => setTab('activity')}
            className={`px-3 py-1.5 text-xs rounded-t font-medium ${tab === 'activity' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Activity log
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
          {loading && <p className="text-slate-500">Loading…</p>}

          {!loading && tab === 'it' && reportError && !report && (
            <p className="text-amber-400 text-xs mb-3">{reportError}</p>
          )}

          {!loading && tab === 'backup' && backupError && !backupsInfo && (
            <p className="text-red-400 text-xs mb-3">{backupError}</p>
          )}

          {!loading && tab === 'activity' && auditError && (
            <p className="text-amber-400 text-xs mb-3">{auditError}</p>
          )}

          {!loading && report && tab === 'it' && (
            <div className="space-y-4">
              {reportError && (
                <p className="text-amber-400 text-xs">{reportError}</p>
              )}
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  report.standaloneMode
                    ? 'border-green-800/60 bg-green-950/30 text-green-200'
                    : 'border-blue-800/60 bg-blue-950/30 text-blue-200'
                }`}
              >
                {report.standaloneMode
                  ? 'Standalone mode — job data stays on this PC; no live Microsoft cloud calls.'
                  : 'Azure mode — calendar/files use Microsoft Graph (logged below).'}
              </div>

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  Safety summary
                </h3>
                <ul className="list-disc list-inside text-slate-300 space-y-1 text-xs">
                  {report.safetySummary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  Data &amp; logs
                </h3>
                <dl className="text-xs text-slate-400 space-y-1">
                  <div>
                    <dt className="text-slate-500 inline">Database: </dt>
                    <dd className="inline text-slate-300 break-all">{report.databaseFile}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 inline">Backups: </dt>
                    <dd className="inline text-slate-300 break-all">{report.backupDirectory}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 inline">Server logs: </dt>
                    <dd className="inline text-slate-300 break-all">{report.logDirectory}</dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  Activity counts
                </h3>
                <ul className="text-xs text-slate-400 space-y-0.5">
                  {report.auditCountsByType.map((c) => (
                    <li key={c.type}>
                      <span className="text-slate-300">{c.type}</span>: {c.count}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  Network destinations
                </h3>
                {report.externalHostsContacted.length === 0 ? (
                  <p className="text-xs text-slate-500">No external hosts in recent network audit.</p>
                ) : (
                  <ul className="text-xs text-slate-300 list-disc list-inside">
                    {report.externalHostsContacted.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                )}
              </section>

              {report.lastSuccessfulBackup && (
                <p className="text-xs text-slate-500">
                  Last backup: {String(report.lastSuccessfulBackup.timestamp)}
                </p>
              )}
            </div>
          )}

          {!loading && tab === 'backup' && (
            <div className="space-y-4">
              {backupError && <p className="text-red-400 text-xs">{backupError}</p>}
              {reportError && backupsInfo && (
                <p className="text-amber-400/90 text-xs">
                  IT summary could not load; backups below still work.
                </p>
              )}

              {backupsInfo ? (
                <>
                  <p className="text-[11px] text-slate-500">
                    Close the backup .db file in Cursor or Excel before restore. Keep the server
                    running — do not open two server windows on port 3001.
                  </p>
                  <p className="text-xs text-slate-400">{backupsInfo.scheduleNote}</p>
                  <p className="text-[11px] text-slate-500 break-all">Folder: {backupsInfo.directory}</p>

                  <button
                    type="button"
                    onClick={handleBackupNow}
                    disabled={backupBusy}
                    className="w-full text-sm py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 font-medium"
                  >
                    {backupBusy ? 'Working…' : 'Backup now'}
                  </button>

                  {backupsInfo.backups.length === 0 ? (
                    <p className="text-xs text-slate-500">No backups yet. Click Backup now.</p>
                  ) : (
                    <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
                      {backupsInfo.backups.map((b) => (
                        <li
                          key={b.file}
                          className="border border-slate-800 rounded-lg p-2 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 text-xs">
                            <p className="text-slate-200 font-mono truncate">{b.file}</p>
                            <p className="text-slate-500">
                              {new Date(b.createdAt).toLocaleString()} ·{' '}
                              {(b.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={backupBusy}
                            onClick={() => handleRestore(b)}
                            className="flex-shrink-0 text-xs px-2 py-1 rounded bg-slate-700 text-slate-200 hover:bg-amber-700/80 disabled:opacity-50"
                          >
                            Restore
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : !loading && !backupError ? (
                <p className="text-xs text-slate-500">No backup list loaded.</p>
              ) : null}
            </div>
          )}

          {!loading && tab === 'activity' && (
            <div className="space-y-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
              >
                <option value="all">All types</option>
                <option value="api_request">API requests</option>
                <option value="file_write">File / database writes</option>
                <option value="network_request">Network</option>
                <option value="backup">Backup</option>
                <option value="restore">Restore</option>
                <option value="system">System</option>
              </select>
              <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
                {filtered.map((e) => (
                  <li
                    key={e.id}
                    className={`text-[11px] font-mono border-b border-slate-800/80 py-1 ${
                      e.success === 0 || e.success === false ? 'text-amber-400' : 'text-slate-400'
                    }`}
                  >
                    <span className="text-slate-600">{e.timestamp?.slice(0, 19)}</span>{' '}
                    <span className="text-slate-500">[{e.type}]</span> {e.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap gap-2 px-4 py-3 border-t border-slate-800">
          <button
            type="button"
            onClick={load}
            disabled={loading || backupBusy}
            className="text-xs px-3 py-1.5 rounded bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={exportForIt}
            disabled={!report}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Export report for IT
          </button>
          <span className="text-[10px] text-slate-600 self-center ml-auto">Ctrl+M</span>
        </footer>
      </aside>
    </>
  );
};

export default MonitoringPanel;
