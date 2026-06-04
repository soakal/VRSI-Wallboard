import React from 'react';
import { SharePointFile } from '../types/index';
import FileIcon from './FileIcon';

interface RecentFilesWidgetProps {
  files: SharePointFile[];
  isLoading: boolean;
  fileOpenMode: 'same-window' | 'new-window';
}

function timeAgo(isoString: string): string {
  const then = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const SkeletonRow: React.FC = () => (
  <div className="flex items-center gap-2 px-1 py-1.5 animate-pulse">
    <div className="h-5 w-8 rounded bg-white/10 flex-shrink-0" />
    <div className="flex-1 space-y-1">
      <div className="h-3 bg-white/10 rounded w-3/4" />
      <div className="h-2.5 bg-white/5 rounded w-1/3" />
    </div>
  </div>
);

const RecentFilesWidget: React.FC<RecentFilesWidgetProps> = ({ files, isLoading, fileOpenMode }) => {
  const handleOpen = (file: SharePointFile) => {
    if (fileOpenMode === 'new-window') {
      window.open(file.webUrl, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = file.webUrl;
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        Recent Files
      </h3>

      {/* Content */}
      <div className="space-y-0.5">
        {isLoading && files.length === 0 && (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </>
        )}

        {!isLoading && files.length === 0 && (
          <p className="text-xs text-slate-500 px-1 py-2">No recent files.</p>
        )}

        {files.map((file) => (
          <button
            key={file.id}
            type="button"
            onClick={() => handleOpen(file)}
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-white/5 transition-colors group"
          >
            <FileIcon mimeType={file.mimeType} fileName={file.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-200 group-hover:text-white transition-colors leading-tight">
                {file.name}
              </p>
              <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                {file.siteName} · {timeAgo(file.lastModifiedDateTime)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RecentFilesWidget;
