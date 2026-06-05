import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CalendarEvent, AppConfig, SharePointFile } from "../types/index";
import Clock from "./Clock";
import NextEventBadge from "./NextEventBadge";
import WeatherWidget from "./WeatherWidget";
import { DisplayModePicker } from "./DisplayModePicker";
import CalendarView from "./CalendarView";
import AgendaRail from "./AgendaRail";
import RecentFilesWidget from "./RecentFilesWidget";
import StalenessIndicator from "./StalenessIndicator";
import { useAppStore } from "../store/appStore";

interface DashboardProps {
  events: CalendarEvent[];
  recentFiles: SharePointFile[];
  recentFilesLoading?: boolean;
  config: AppConfig;
  isOnline: boolean;
  dataUpdatedAt: number;
  calendarError?: boolean;
  needsReauth?: boolean;
  displayMode: 'day' | 'week' | 'month';
  onSetDisplayMode: (mode: 'day' | 'week' | 'month') => void;
  onOpenSettings: () => void;
  onOpenFiles: () => void;
}

const STALE_THRESHOLD_MS = 10 * 60 * 1000;

const Dashboard: React.FC<DashboardProps> = ({
  events,
  recentFiles,
  recentFilesLoading = false,
  config,
  isOnline,
  dataUpdatedAt,
  calendarError = false,
  needsReauth = false,
  displayMode,
  onSetDisplayMode,
  onOpenSettings,
  onOpenFiles,
}) => {
  const navigate = useNavigate();
  const setIsMonitoringOpen = useAppStore((s) => s.setIsMonitoringOpen);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sunsetIso, setSunsetIso] = useState<string | null>(null);
  const [isDimmed, setIsDimmed] = useState(false);

  // Tick every minute to re-evaluate staleness and sunset dimming
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Evaluate sunset dimming whenever nowMs or sunsetIso changes
  useEffect(() => {
    if (!sunsetIso) { setIsDimmed(false); return; }
    const sunsetMs = new Date(sunsetIso).getTime();
    setIsDimmed(Date.now() > sunsetMs);
  }, [nowMs, sunsetIso]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") { e.preventDefault(); onOpenSettings(); }
      if (e.ctrlKey && e.key === "f") { e.preventDefault(); onOpenFiles(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onOpenSettings, onOpenFiles]);

  const handleSunsetIso = useCallback((iso: string) => setSunsetIso(iso), []);

  const handleSelectEvent = useCallback((ev: import('../types/index').CalendarEvent) => {
    if (ev.calendarId === 'board-jobs') {
      const jobNumber = ev.id.replace('board-ship-', '');
      const tab = ev.boardTab ?? 'project';
      const base =
        tab === 'spare-parts' ? '/board/spare-parts' : tab === 'archive' ? '/board/archive' : '/board';
      navigate(`${base}?job=${encodeURIComponent(jobNumber)}`);
    }
  }, [navigate]);

  const minutesSinceUpdate = dataUpdatedAt > 0 ? Math.floor((nowMs - dataUpdatedAt) / 60_000) : null;
  const showBanner =
    needsReauth ||
    calendarError ||
    !isOnline ||
    (dataUpdatedAt > 0 && nowMs - dataUpdatedAt > STALE_THRESHOLD_MS);

  return (
    <div
      className={`h-screen w-screen flex flex-col bg-[#0f1117] text-slate-200 overflow-hidden transition-[filter] duration-[2000ms] ${isDimmed ? "brightness-[0.65]" : "brightness-100"}`}
    >
      {/* Staleness / offline banner */}
      {showBanner && (
        <StalenessIndicator
          isOnline={isOnline}
          minutesSinceUpdate={minutesSinceUpdate}
          calendarError={calendarError}
          needsReauth={needsReauth}
        />
      )}

      {/* Top bar */}
      <header className="flex flex-shrink-0 items-center gap-3 px-4 py-3 md:gap-6 md:px-6 md:py-3 border-b border-white/5 bg-black/20">
        {/* Clock - left */}
        <div className="flex-shrink-0">
          <Clock timeFormat={config.timeFormat} />
        </div>

        {/* Center: VRSI logo (desktop only) + NextEventBadge */}
        <div className="flex flex-1 flex-col items-center justify-center gap-1 min-w-0">
          <img src="/logos/vrsi-white-letters.png" alt="VRSI" className="hidden md:block h-20 w-auto opacity-85" />
          {config.showNextEvent && (
            <div className="hidden md:block">
              <NextEventBadge events={events} />
            </div>
          )}
        </div>

        {/* Weather - right */}
        {config.showWeather && (
          <>
            <div className="hidden md:flex flex-shrink-0">
              <WeatherWidget
                lat={config.weatherLat}
                lon={config.weatherLon}
                tempUnit={config.tempUnit}
                onSunsetIso={handleSunsetIso}
              />
            </div>
            <div className="flex md:hidden flex-shrink-0">
              <WeatherWidget
                lat={config.weatherLat}
                lon={config.weatherLon}
                tempUnit={config.tempUnit}
                onSunsetIso={handleSunsetIso}
                compact
              />
            </div>
          </>
        )}
      </header>

      {/* Next event badge — mobile only, below header */}
      {config.showNextEvent && (
        <div className="md:hidden px-4 py-2 border-b border-white/5 bg-black/10">
          <NextEventBadge events={events} />
        </div>
      )}

      {/* Main content row — desktop layout (calendar + right panel) */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Calendar - grows to fill */}
        <main className="flex-1 overflow-hidden p-3">
          <CalendarView
            events={events}
            displayMode={displayMode}
            showWeekends={config.showWeekends}
            startHour={config.startHour}
            endHour={config.endHour}
            className="h-full"
            onSelectEvent={handleSelectEvent}
          />
        </main>

        {/* Right panel - w-72 */}
        {(config.showAgendaRail || config.showRecentFiles) && (
          <aside className="flex w-72 flex-shrink-0 flex-col gap-4 overflow-hidden border-l border-white/5 bg-black/10 p-4">
            {config.showAgendaRail && (
              <div className="flex min-h-0 flex-1 flex-col">
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Agenda
                </h2>
                <AgendaRail
                  events={events}
                  showWeekends={config.showWeekends}
                  className="min-h-0 flex-1"
                  onSelectEvent={handleSelectEvent}
                />
              </div>
            )}

            {config.showRecentFiles && (
              <div className="flex-shrink-0 border-t border-white/5 pt-4">
                <RecentFilesWidget
                  files={recentFiles.slice(0, config.recentFilesCount)}
                  isLoading={recentFilesLoading}
                  fileOpenMode={config.fileOpenMode}
                />
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Mobile agenda section — fills remaining space, scrollable */}
      <div className="md:hidden flex-1 overflow-y-auto px-4 py-3">
        {config.showAgendaRail && (
          <div className="mb-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Agenda
            </h2>
            <AgendaRail
              events={events}
              showWeekends={config.showWeekends}
              className="min-h-0"
              onSelectEvent={handleSelectEvent}
            />
          </div>
        )}

        {config.showRecentFiles && (
          <div className="border-t border-white/5 pt-4">
            <RecentFilesWidget
              files={recentFiles.slice(0, config.recentFilesCount)}
              isLoading={recentFilesLoading}
              fileOpenMode={config.fileOpenMode}
            />
          </div>
        )}
      </div>

      {/* Status bar — desktop only (keyboard hints + display mode) */}
      <footer className="hidden md:flex flex-shrink-0 items-center justify-between border-t border-white/5 bg-black/20 px-5 py-1.5">
        <div className="flex items-center gap-3">
          <DisplayModePicker mode={displayMode} onChange={onSetDisplayMode} />
          <a
            href="/api/board/export/ship-dates.ics"
            download="vrsi-ship-dates.ics"
            className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
            title="Download ship dates as .ics to import into Outlook or any calendar app"
          >
            ↓ Export Ship Dates
          </a>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-slate-600">
          <button
            type="button"
            onClick={onOpenSettings}
            className="hover:text-slate-400 transition-colors"
            title="Open Settings"
          >
            Ctrl+S Settings
          </button>
          <span>|</span>
          <button
            type="button"
            onClick={onOpenFiles}
            className="hover:text-slate-400 transition-colors"
            title="Open Files"
          >
            Ctrl+F Files
          </button>
          <span>|</span>
          <button
            type="button"
            onClick={() => setIsMonitoringOpen(true)}
            className="hover:text-slate-400 transition-colors"
            title="IT safety report and activity log"
          >
            Ctrl+M System
          </button>
          <span>|</span>
          <Link to="/board" className="hover:text-slate-400 transition-colors">
            Projects
          </Link>
        </div>
      </footer>

      {/* Mobile bottom nav bar */}
      <div className="md:hidden flex flex-shrink-0 items-center justify-between px-3 py-2 bg-[#13171f] border-t border-slate-800">
        <div className="flex gap-1">
          <DisplayModePicker mode={displayMode} onChange={onSetDisplayMode} />
        </div>
        <div className="flex items-center gap-1.5">
          <Link to="/board" className="flex items-center bg-slate-700/60 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded transition-colors text-xs font-medium">
            Projects
          </Link>
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 text-slate-500 hover:text-slate-300 text-lg leading-none"
            aria-label="Settings"
          >
            ⚙
          </button>
          <button
            type="button"
            onClick={onOpenFiles}
            className="p-2 text-slate-500 hover:text-slate-300 text-lg leading-none"
            aria-label="Files"
          >
            📁
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
