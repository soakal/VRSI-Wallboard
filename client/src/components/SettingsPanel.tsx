import React, { useState, useEffect, useRef } from "react";
import { AppConfig } from "../types/index";
import CalendarSelector from "./CalendarSelector";
import { useCalendars } from "../hooks/useCalendars";
import { useUpdateConfig } from "../hooks/useConfig";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
}

type SectionKey = "calendars" | "display" | "widgets" | "time" | "location" | "files";

const SectionHeader: React.FC<{ label: string; isOpen: boolean; onToggle: () => void }> = ({ label, isOpen, onToggle }) => (
  <button type="button" onClick={onToggle} className="flex w-full items-center justify-between py-2 text-left">
    <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</span>
    <svg className={`h-3.5 w-3.5 text-slate-600 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  </button>
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }> = ({ checked, onChange, label, description }) => (
  <label className="flex items-start justify-between gap-4 py-1.5 cursor-pointer group">
    <div className="min-w-0">
      <span className="text-sm text-slate-200 group-hover:text-white transition-colors">{label}</span>
      {description && <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>}
    </div>
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${checked ? "bg-blue-600" : "bg-slate-700"}`}>
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  </label>
);

const SelectField: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }> = ({ label, value, onChange, options }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
    <span className="text-sm text-slate-300 flex-shrink-0">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-lg bg-white/5 border border-white/10 text-sm text-slate-200 px-2 py-1.5 focus:outline-none focus:border-blue-500/50 hover:border-white/20 transition-colors min-w-0">
      {options.map((o) => (<option key={o.value} value={o.value} className="bg-[#1e2536]">{o.label}</option>))}
    </select>
  </div>
);

const NumberField: React.FC<{ label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }> = ({ label, value, onChange, min, max, step = 1, suffix }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
    <span className="text-sm text-slate-300 flex-shrink-0">{label}</span>
    <div className="flex items-center gap-1.5">
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} min={min} max={max} step={step}
        className="w-20 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-200 px-2 py-1.5 text-right focus:outline-none focus:border-blue-500/50 hover:border-white/20 transition-colors" />
      {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
    </div>
  </div>
);

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, config }) => {
  const { data: calendars = [] } = useCalendars(isOpen);
  const updateConfig = useUpdateConfig();
  const onSave = async (partial: Partial<AppConfig>) => { await updateConfig.mutateAsync(partial); };
  const [local, setLocal] = useState<AppConfig>({ ...config });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [zipInput, setZipInput] = useState("");
  const [zipStatus, setZipStatus] = useState<{ type: "ok" | "error"; message: string } | null>(null);
  const [zipLooking, setZipLooking] = useState(false);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    calendars: true, display: true, widgets: true, time: true, location: false, files: false,
  });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocal({ ...config }); setZipInput(""); setZipStatus(null); }, [config]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const toggleSection = (key: SectionKey) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => setLocal((prev) => ({ ...prev, [key]: value }));

  const lookupZip = async () => {
    const query = zipInput.trim();
    if (!query) return;
    setZipLooking(true);
    setZipStatus(null);
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
      const data = await res.json();
      if (data.results?.length) {
        const { latitude, longitude, name, admin1 } = data.results[0];
        set("weatherLat", latitude);
        set("weatherLon", longitude);
        setZipStatus({ type: "ok", message: `${name}${admin1 ? `, ${admin1}` : ""}` });
      } else {
        setZipStatus({ type: "error", message: "ZIP code not found" });
      }
    } catch {
      setZipStatus({ type: "error", message: "Lookup failed — check connection" });
    } finally {
      setZipLooking(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try { await onSave(local); onClose(); }
    catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to save settings"); }
    finally { setSaving(false); }
  };

  const handleDiscard = () => { setLocal({ ...config }); onClose(); };

  const hourOptions = Array.from({ length: 24 }, (_, i) => ({
    value: String(i),
    label: i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`,
  }));

  const timezoneOptions = [
    "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
    "America/Anchorage","Pacific/Honolulu","Europe/London","Europe/Paris",
    "Europe/Berlin","Asia/Tokyo","Asia/Shanghai","Australia/Sydney",
  ].map((tz) => ({ value: tz, label: tz.replace("_", " ") }));

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        style={{ zIndex: 49 }}
        onClick={handleDiscard}
      />
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 bottom-0 w-full md:w-96 bg-[#161b27] border-l border-white/10 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}
        style={{ zIndex: 50 }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">Settings</h2>
          <button type="button" onClick={handleDiscard} className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="border-b border-white/5 pb-4">
            <SectionHeader label="Calendars" isOpen={openSections.calendars} onToggle={() => toggleSection("calendars")} />
            {openSections.calendars && (
              <div className="mt-2">
                <CalendarSelector calendars={calendars} selectedIds={local.calendarIds} onChange={(ids) => set("calendarIds", ids)} />
              </div>
            )}
          </div>

          <div className="border-b border-white/5 pb-4">
            <SectionHeader label="Display" isOpen={openSections.display} onToggle={() => toggleSection("display")} />
            {openSections.display && (
              <div className="mt-2 space-y-0.5">
                <SelectField label="Calendar view" value={local.displayMode} onChange={(v) => set("displayMode", v as AppConfig["displayMode"])}
                  options={[{ value: "day", label: "Day" },{ value: "week", label: "Week" },{ value: "month", label: "Month" }]} />
                <SelectField label="Timezone" value={local.timezone} onChange={(v) => set("timezone", v)} options={timezoneOptions} />
                <Toggle checked={local.showWeekends} onChange={(v) => set("showWeekends", v)} label="Show weekends" />
                <SelectField label="Day start" value={String(local.startHour)} onChange={(v) => set("startHour", Number(v))} options={hourOptions.slice(0, 20)} />
                <SelectField label="Day end" value={String(local.endHour)} onChange={(v) => set("endHour", Number(v))} options={hourOptions.slice(4)} />
                <NumberField label="Refresh interval" value={local.refreshInterval} onChange={(v) => set("refreshInterval", v)} min={30} max={3600} step={30} suffix="sec" />
              </div>
            )}
          </div>

          <div className="border-b border-white/5 pb-4">
            <SectionHeader label="Widgets" isOpen={openSections.widgets} onToggle={() => toggleSection("widgets")} />
            {openSections.widgets && (
              <div className="mt-2 space-y-0.5">
                <Toggle checked={local.showAgendaRail} onChange={(v) => set("showAgendaRail", v)} label="Agenda rail" description="Today + tomorrow events sidebar" />
                <Toggle checked={local.showWeather} onChange={(v) => set("showWeather", v)} label="Weather widget" />
                <Toggle checked={local.showNextEvent} onChange={(v) => set("showNextEvent", v)} label="Next event badge" />
                <Toggle checked={local.showRecentFiles} onChange={(v) => set("showRecentFiles", v)} label="Recent files" />
                {local.showRecentFiles && (
                  <NumberField label="Files to show" value={local.recentFilesCount} onChange={(v) => set("recentFilesCount", v)} min={1} max={20} />
                )}
              </div>
            )}
          </div>

          <div className="border-b border-white/5 pb-4">
            <SectionHeader label="Time & Units" isOpen={openSections.time} onToggle={() => toggleSection("time")} />
            {openSections.time && (
              <div className="mt-2 space-y-0.5">
                <SelectField label="Time format" value={local.timeFormat} onChange={(v) => set("timeFormat", v as AppConfig["timeFormat"])}
                  options={[{ value: "12h", label: "12-hour (AM/PM)" },{ value: "24h", label: "24-hour" }]} />
                <SelectField label="Temperature" value={local.tempUnit} onChange={(v) => set("tempUnit", v as AppConfig["tempUnit"])}
                  options={[{ value: "F", label: "Fahrenheit (F)" },{ value: "C", label: "Celsius (C)" }]} />
              </div>
            )}
          </div>

          <div className="border-b border-white/5 pb-4">
            <SectionHeader label="Location" isOpen={openSections.location} onToggle={() => toggleSection("location")} />
            {openSections.location && (
              <div className="mt-2">
                <div className="flex items-center gap-2 py-1.5">
                  <span className="text-sm text-slate-300 flex-shrink-0">ZIP Code</span>
                  <input
                    type="text"
                    value={zipInput}
                    onChange={(e) => { setZipInput(e.target.value); setZipStatus(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") lookupZip(); }}
                    placeholder="e.g. 10001"
                    maxLength={10}
                    className="w-28 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-200 px-2 py-1.5 text-right focus:outline-none focus:border-blue-500/50 hover:border-white/20 transition-colors placeholder-slate-600"
                  />
                  <button type="button" onClick={lookupZip} disabled={zipLooking || !zipInput.trim()}
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-3 py-1.5 text-xs font-medium text-white transition-colors">
                    {zipLooking ? "..." : "Look up"}
                  </button>
                </div>
                {zipStatus && (
                  <p className={`text-[11px] mt-1 ${zipStatus.type === "ok" ? "text-green-400" : "text-red-400"}`}>
                    {zipStatus.type === "ok" ? `✓ ${zipStatus.message}` : `✗ ${zipStatus.message}`}
                  </p>
                )}
                {local.weatherLat !== null && local.weatherLon !== null && zipStatus?.type !== "ok" && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Current: {local.weatherLat.toFixed(4)}, {local.weatherLon.toFixed(4)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="pb-4">
            <SectionHeader label="Files" isOpen={openSections.files} onToggle={() => toggleSection("files")} />
            {openSections.files && (
              <div className="mt-2 space-y-0.5">
                <SelectField label="Open files in" value={local.fileOpenMode} onChange={(v) => set("fileOpenMode", v as AppConfig["fileOpenMode"])}
                  options={[{ value: "same-window", label: "Same window" },{ value: "new-window", label: "New window" }]} />
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-white/10 px-5 py-4 space-y-2">
          {saveError && <p className="text-xs text-red-400 text-center">{saveError}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={handleDiscard}
              className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:border-white/20 transition-colors">
              Discard
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsPanel;