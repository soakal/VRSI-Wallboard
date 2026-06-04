import React, { useEffect } from 'react';
import { useWeather, interpretWeatherCode } from '../hooks/useWeather';

interface WeatherWidgetProps {
  lat: number | null;
  lon: number | null;
  tempUnit: 'F' | 'C';
  onSunsetIso?: (iso: string) => void;
  compact?: boolean;
}

function getDayLabel(index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tmrw';
  return '';
}

const WeatherWidget: React.FC<WeatherWidgetProps> = ({ lat, lon, tempUnit, onSunsetIso, compact = false }) => {
  const { data, isLoading, isError } = useWeather(lat, lon, tempUnit);

  useEffect(() => {
    if (data?.sunsetIso && onSunsetIso) {
      onSunsetIso(data.sunsetIso);
    }
  }, [data?.sunsetIso, onSunsetIso]);

  if (lat === null || lon === null) {
    if (compact) return null;
    return (
      <div className="flex items-center gap-1.5 text-sm text-slate-400">
        <span>📍</span>
        <span>Set location in Settings</span>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 animate-pulse">
        <span className="h-4 w-24 rounded bg-slate-700" />
      </div>
    );
  }

  if (isError && !data) {
    return <div className="text-xs text-red-400">Weather unavailable</div>;
  }

  if (!data) return null;

  const currentEmoji = data.conditionEmoji;
  const currentLabel = data.condition;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-slate-300">
        <span className="text-base leading-none">{currentEmoji}</span>
        <span className="font-medium text-white">{data.currentTemp}°{tempUnit}</span>
        <span className="text-slate-400 text-xs">· {currentLabel}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {/* Current */}
      <div className="flex items-center gap-1.5">
        <span className="text-3xl leading-none">{currentEmoji}</span>
        <div className="leading-tight">
          <div className="text-2xl font-light text-white">
            {data.currentTemp}°{tempUnit}
          </div>
          <div className="text-[11px] text-slate-400">{currentLabel}</div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-10 w-px bg-white/10" />

      {/* 3-day strip (days 1-3, skip today) */}
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => {
          const day = data.forecast[i];
          if (!day) return null;
          const { conditionEmoji } = interpretWeatherCode(day.code);
          return (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                {getDayLabel(i) || day.day}
              </span>
              <span className="text-base leading-none">{conditionEmoji}</span>
              <span className="text-xs text-white font-medium">{day.hi}°</span>
              <span className="text-[10px] text-slate-500">{day.lo}°</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeatherWidget;
