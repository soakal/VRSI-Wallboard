import React from 'react';

interface FileIconProps {
  mimeType?: string;
  fileName?: string;
}

interface IconConfig {
  label: string;
  bgColor: string;
  textColor: string;
}

function getIconConfig(mimeType?: string, fileName?: string): IconConfig {
  const mime = (mimeType || '').toLowerCase();
  const ext = fileName ? fileName.split('.').pop()?.toLowerCase() ?? '' : '';

  // Excel
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    ext === 'xlsx' ||
    ext === 'xls' ||
    ext === 'csv'
  ) {
    return { label: 'XLS', bgColor: 'bg-green-700/80', textColor: 'text-green-100' };
  }

  // Word
  if (
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    ext === 'docx' ||
    ext === 'doc'
  ) {
    return { label: 'DOC', bgColor: 'bg-blue-700/80', textColor: 'text-blue-100' };
  }

  // PowerPoint
  if (
    mime.includes('presentationml') ||
    mime.includes('powerpoint') ||
    ext === 'pptx' ||
    ext === 'ppt'
  ) {
    return { label: 'PPT', bgColor: 'bg-orange-700/80', textColor: 'text-orange-100' };
  }

  // PDF
  if (mime.includes('pdf') || ext === 'pdf') {
    return { label: 'PDF', bgColor: 'bg-red-700/80', textColor: 'text-red-100' };
  }

  // Images
  if (
    mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)
  ) {
    return { label: 'IMG', bgColor: 'bg-purple-700/80', textColor: 'text-purple-100' };
  }

  // Default
  return { label: 'FILE', bgColor: 'bg-slate-700/80', textColor: 'text-slate-300' };
}

const FileIcon: React.FC<FileIconProps> = ({ mimeType, fileName }) => {
  const { label, bgColor, textColor } = getIconConfig(mimeType, fileName);

  return (
    <span
      className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider flex-shrink-0 ${bgColor} ${textColor}`}
    >
      {label}
    </span>
  );
};

export default FileIcon;
