import React from 'react';

interface StalenessIndicatorProps {
  isOnline: boolean;
  minutesSinceUpdate: number | null;
  calendarError?: boolean;
  needsReauth?: boolean;
}

const StalenessIndicator: React.FC<StalenessIndicatorProps> = ({
  isOnline,
  minutesSinceUpdate,
  calendarError = false,
  needsReauth = false,
}) => {
  if (needsReauth) {
    return (
      <div className="flex items-center justify-center gap-2 bg-red-900/60 px-4 py-1.5 text-sm text-red-200">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        <span>Microsoft sign-in expired — open Settings or go to /setup to sign in again</span>
      </div>
    );
  }

  if (calendarError) {
    return (
      <div className="flex items-center justify-center gap-2 bg-red-900/60 px-4 py-1.5 text-sm text-red-200">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        <span>Calendar could not load — check backend (port 3001) and Microsoft auth</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center justify-center gap-2 bg-red-900/60 px-4 py-1.5 text-sm text-red-200">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        <span>Offline — displaying cached data</span>
      </div>
    );
  }

  if (minutesSinceUpdate !== null && minutesSinceUpdate > 10) {
    return (
      <div className="flex items-center justify-center gap-2 bg-amber-900/50 px-4 py-1.5 text-sm text-amber-200">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span>Data last updated {minutesSinceUpdate} minutes ago</span>
      </div>
    );
  }

  return null;
};

export default StalenessIndicator;
