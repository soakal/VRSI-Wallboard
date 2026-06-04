import React, { useState, useEffect } from 'react';

interface ClockProps {
  timeFormat: '12h' | '24h';
}

function getTimeParts(timeFormat: '12h' | '24h'): { time: string; date: string } {
  const now = new Date();

  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  let timeStr: string;

  if (timeFormat === '12h') {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    timeStr = `${hours}:${minutes} ${ampm}`;
  } else {
    timeStr = `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return { time: timeStr, date: dateStr };
}

const Clock: React.FC<ClockProps> = ({ timeFormat }) => {
  const [parts, setParts] = useState(() => getTimeParts(timeFormat));

  useEffect(() => {
    setParts(getTimeParts(timeFormat));
    const id = setInterval(() => {
      setParts(getTimeParts(timeFormat));
    }, 1000);
    return () => clearInterval(id);
  }, [timeFormat]);

  return (
    <div className="flex flex-col leading-none">
      <span className="text-4xl font-light md:text-7xl md:font-thin tracking-tight text-white">
        {parts.time}
      </span>
      <span className="mt-1 text-xs md:text-sm font-normal text-slate-400 tracking-wide">
        {parts.date}
      </span>
    </div>
  );
};

export default Clock;
