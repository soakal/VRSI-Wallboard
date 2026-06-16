import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addDays, addWeeks, addMonths, isSameDay, isSameMonth, startOfWeek } from "date-fns";
import type { CalendarEvent, AppConfig, SharePointFile } from "../types/index";
import Clock from "./Clock";
import NextEventBadge from "./NextEventBadge";
import WeatherWidget from "./WeatherWidget";
import CalendarView from "./CalendarView";
import AgendaRail from "./AgendaRail";
import RecentFilesWidget from "./RecentFilesWidget";
import StalenessIndicator from "./StalenessIndicator";
import { useAppStore } from "../store/appStore";
import { useBoardUsers, useBoardConfig } from "../hooks/useBoard";
import { filterAgendaEvents } from "../lib/agendaFilter";

interface DashboardProps {
  events: CalendarEvent[];
  recentFiles: SharePointFile[];
  recentFilesLoading?: boolean;
  config: AppConfig;
  isOnline: boolean;
  dataUpdatedAt: number;
  calendarError?: boolean;
  needsReauth?: boolean;
  displayMode: 'day' | 'week' | 'month' | 'twoWeek';
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
  onOpenSettings,
  onOpenFiles,
}) => {
  const navigate = useNavigate();
  const setIsMonitoringOpen = useAppStore((s) => s.setIsMonitoringOpen);
  const setDisplayMode = useAppStore((s) => s.setDisplayMode);
  const viewDate = useAppStore((s) => s.viewDate);
  const setViewDate = useAppStore((s) => s.setViewDate);
  const activeUser = useAppStore((s) => s.activeUser);
  const setActiveUser = useAppStore((s) => s.setActiveUser);
  const { users } = useBoardUsers();
  const { config: boardConfig } = useBoardConfig();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sunsetIso, setSunsetIso] = useState<string | null>(null);
  const [isDimmed, setIsDimmed] = useState(false);

  // Agenda: the selected user sees only board jobs where they are the PM or
  // the Materials Manager; super users (and no selection) see everything.
  // Outlook events are never filtered. Logic lives in lib/agendaFilter.ts.
  const agendaEvents = useMemo(
    () => filterAgendaEvents(events, activeUser, boardConfig),
    [events, activeUser, boardConfig],
  );

  // Calendar navigation — ‹ › step by the current view (day/week/month),
  // Today jumps back. The agenda rail follows the displayed month.
  const stepViewDate = useCallback(
    (dir: 1 | -1) => {
      const next =
        displayMode === 'month' ? addMonths(viewDate, dir)
        : displayMode === 'week' ? addWeeks(viewDate, dir)
        : displayMode === 'twoWeek' ? addDays(viewDate, dir * 14)
        : addDays(viewDate, dir);
      setViewDate(next);
    },
    [displayMode, viewDate, setViewDate],
  );
  const isViewingToday = isSameDay(viewDate, new Date());
  const isViewingCurrentMonth = isSameMonth(viewDate, new Date());
  const viewLabel = (() => {
    if (displayMode === 'day') {
      return viewDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    if (displayMode === 'week' || displayMode === 'twoWeek') {
      // Show the date span the view covers, e.g. "Jun 15 – 21, 2026" or, across
      // months, "Jun 29 – Jul 5, 2026" — a week/fortnight often straddles two
      // months and the bare month name was vague.
      const weekStartsOn = config.showWeekends ? 0 : 1;
      const start = startOfWeek(viewDate, { weekStartsOn });
      const end = addDays(start, displayMode === 'twoWeek' ? 13 : 6);
      const sameMonth = start.getMonth() === end.getMonth();
      const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = sameMonth
        ? end.toLocaleDateString('en-US', { day: 'numeric' })
        : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${startStr} – ${endStr}, ${end.getFullYear()}`;
    }
    return viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  })();
  const agendaMonthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const handleSelectUserId = useCallback(
    (id: string) => {
      if (!id) { setActiveUser(null); return; }
      const user = users.find((u) => u.id === id) ?? null;
      setActiveUser(user);
    },
    [users, setActiveUser],
  );

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
      if (e.ctrlKey && e.key === "f" && config.showFiles) { e.preventDefault(); onOpenFiles(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onOpenSettings, onOpenFiles, config.showFiles]);

  const handleSunsetIso = useCallback((iso: string) => setSunsetIso(iso), []);

  const handleSelectEvent = useCallback((ev: import('../types/index').CalendarEvent) => {
    if (ev.calendarId === 'board-jobs') {
      const jobNumber = ev.id.replace('board-ship-', '');
      const tab = ev.boardTab ?? 'project';
      const base =
        tab === 'blocked' ? '/board/blocked'
        : tab === 'spare-parts' ? '/board/spare-parts'
        : tab === 'archive' ? '/board/archive'
        : '/board';
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
            date={viewDate}
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
                  Agenda{!isViewingCurrentMonth && ` — ${agendaMonthLabel}`}
                </h2>
                <AgendaRail
                  events={agendaEvents}
                  viewDate={viewDate}
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
              Agenda{!isViewingCurrentMonth && ` — ${agendaMonthLabel}`}
            </h2>
            <AgendaRail
              events={agendaEvents}
              viewDate={viewDate}
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

      {/* Status bar — desktop only */}
      <footer className="hidden md:flex flex-shrink-0 items-center justify-between border-t border-white/5 bg-black/20 px-5 py-1.5">
        <div className="flex items-center gap-2">
          <select
            value={displayMode}
            onChange={(e) => setDisplayMode(e.target.value as 'day' | 'week' | 'month' | 'twoWeek')}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-[#1a1f2e] border border-white/10 hover:border-white/20 focus:outline-none transition-colors cursor-pointer"
            title="Switch calendar view (D/W/T/M)"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="twoWeek">2 Weeks</option>
            <option value="month">Month</option>
          </select>
          <button
            type="button"
            onClick={() => stepViewDate(-1)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
            title={`Previous ${displayMode}`}
            aria-label={`Previous ${displayMode}`}
          >
            ‹
          </button>
          <span className="min-w-[7.5rem] text-center text-xs font-semibold text-slate-200">
            {viewLabel}
          </span>
          <button
            type="button"
            onClick={() => stepViewDate(1)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
            title={`Next ${displayMode}`}
            aria-label={`Next ${displayMode}`}
          >
            ›
          </button>
          {!isViewingToday && (
            <button
              type="button"
              onClick={() => setViewDate(new Date())}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
              title="Jump back to today"
            >
              Today
            </button>
          )}
          <a
            href="/api/board/export/ship-dates.ics"
            download="vrsi-ship-dates.ics"
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
            title="Download ship dates as .ics to import into Outlook or any calendar app"
          >
            ↓ Export Ship Dates
          </a>
          <select
            value={activeUser?.id ?? ''}
            onChange={(e) => handleSelectUserId(e.target.value)}
            className="max-w-[11rem] rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-[#1a1f2e] border border-white/10 hover:border-white/20 focus:outline-none transition-colors cursor-pointer"
            title="Select your name — the agenda shows only your jobs (super users see everything)"
          >
            <option value="">👤 All users</option>
            {activeUser && !users.some((u) => u.id === activeUser.id) && (
              <option value={activeUser.id}>{activeUser.name}</option>
            )}
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
            title="Open Settings (Ctrl+S)"
          >
            ⚙ Settings
          </button>
          {config.showFiles && (
            <button
              type="button"
              onClick={onOpenFiles}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
              title="Open Files (Ctrl+F)"
            >
              Files
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsMonitoringOpen(true)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
            title="System monitor (Ctrl+M)"
          >
            System
          </button>
          <span className="rounded-md px-2.5 py-1 text-xs font-semibold text-white bg-blue-600/70 border border-blue-500/40">
            Calendar
          </span>
          <Link
            to="/board"
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
          >
            Projects
          </Link>
        </div>
      </footer>

      {/* Mobile bottom nav bar */}
      <div className="md:hidden flex flex-shrink-0 items-center justify-between px-3 py-2 bg-[#13171f] border-t border-slate-800">
        <div className="flex gap-1.5">
          <select
            value={displayMode}
            onChange={(e) => setDisplayMode(e.target.value as 'day' | 'week' | 'month' | 'twoWeek')}
            className="bg-slate-700/60 border border-slate-600 text-slate-200 px-2 py-1.5 rounded text-xs font-medium focus:outline-none cursor-pointer"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="twoWeek">2 Weeks</option>
            <option value="month">Month</option>
          </select>
          <button
            type="button"
            onClick={() => stepViewDate(-1)}
            className="bg-slate-700/60 border border-slate-600 text-slate-200 px-2.5 py-1.5 rounded text-xs font-medium"
            aria-label={`Previous ${displayMode}`}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => stepViewDate(1)}
            className="bg-slate-700/60 border border-slate-600 text-slate-200 px-2.5 py-1.5 rounded text-xs font-medium"
            aria-label={`Next ${displayMode}`}
          >
            ›
          </button>
          {!isViewingToday && (
            <button
              type="button"
              onClick={() => setViewDate(new Date())}
              className="bg-slate-700/60 border border-slate-600 text-slate-200 px-2 py-1.5 rounded text-xs font-medium"
            >
              Today
            </button>
          )}
          <select
            value={activeUser?.id ?? ''}
            onChange={(e) => handleSelectUserId(e.target.value)}
            className="max-w-[7.5rem] bg-slate-700/60 border border-slate-600 text-slate-200 px-2 py-1.5 rounded text-xs font-medium focus:outline-none cursor-pointer"
            title="Select your name — the agenda shows only your jobs"
          >
            <option value="">👤 All</option>
            {activeUser && !users.some((u) => u.id === activeUser.id) && (
              <option value={activeUser.id}>{activeUser.name}</option>
            )}
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center bg-blue-600/70 text-white px-3 py-1.5 rounded text-xs font-semibold border border-blue-500/40">
            Calendar
          </span>
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
          {config.showFiles && (
            <button
              type="button"
              onClick={onOpenFiles}
              className="p-2 text-slate-500 hover:text-slate-300 text-lg leading-none"
              aria-label="Files"
            >
              📁
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
