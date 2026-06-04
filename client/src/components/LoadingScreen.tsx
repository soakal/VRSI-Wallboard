import React from 'react';

const LoadingScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0f1117]">
      <div className="flex flex-col items-center gap-6">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-white/10 border-t-blue-500" />
        </div>
        <div className="text-center">
          <img src="/logos/vrsi-white-letters.png" alt="VRSI" className="h-12 w-auto mx-auto" />
          <p className="mt-2 text-sm text-slate-500 tracking-widest">Loading…</p>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
