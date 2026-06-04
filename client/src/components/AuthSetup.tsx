import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AuthStartResponse } from '../types/index';

interface AuthSetupProps {
  onAuthenticated: () => void;
}

interface AuthState {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  loading: boolean;
  error: string | null;
  startedAt: number;
}

const AuthSetup: React.FC<AuthSetupProps> = ({ onAuthenticated }) => {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  const startAuth = useCallback(async () => {
    setAuth(prev => prev ? { ...prev, loading: true, error: null } : {
      userCode: '',
      verificationUri: '',
      expiresIn: 0,
      loading: true,
      error: null,
      startedAt: Date.now(),
    });
    stopPolling();

    try {
      const res = await fetch('/api/auth/start', { method: 'POST' });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data: AuthStartResponse = await res.json();

      const startedAt = Date.now();
      setAuth({
        userCode: data.userCode,
        verificationUri: data.verificationUri,
        expiresIn: data.expiresIn,
        loading: false,
        error: null,
        startedAt,
      });
      setSecondsLeft(data.expiresIn);

      // Countdown timer
      countdownRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            stopPolling();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Poll status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/auth/status');
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          if (statusData.authenticated) {
            stopPolling();
            onAuthenticated();
          }
        } catch {
          // ignore transient errors
        }
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start authentication';
      setAuth(prev => prev ? { ...prev, loading: false, error: message } : null);
    }
  }, [onAuthenticated]);

  useEffect(() => {
    startAuth();
    return () => stopPolling();
  }, [startAuth]);

  const formatCountdown = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0f1117] text-slate-200 p-8">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Title */}
        <div>
          <img src="/logos/vrsi-white-letters.png" alt="VRSI" className="h-14 w-auto mx-auto mb-3" />
          <p className="text-slate-500 text-sm tracking-wide">Microsoft 365 Sign-In Required</p>
        </div>

        {auth?.loading && !auth.userCode && (
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-blue-500" />
            <p className="text-slate-400">Starting authentication…</p>
          </div>
        )}

        {auth?.error && (
          <div className="rounded-xl bg-red-900/30 border border-red-700/40 p-6 space-y-4">
            <p className="text-red-300 text-sm">{auth.error}</p>
            <button
              onClick={startAuth}
              className="rounded-lg bg-blue-600 hover:bg-blue-500 px-6 py-2 text-sm font-medium text-white transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {auth && !auth.error && auth.userCode && (
          <div className="space-y-6">
            {/* Instructions */}
            <p className="text-slate-400 text-sm leading-relaxed">
              Visit the URL below and enter the code to sign in with your Microsoft account.
            </p>

            {/* URL */}
            <a
              href={auth.verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-blue-400 hover:text-blue-300 text-sm underline underline-offset-2 break-all transition-colors"
            >
              {auth.verificationUri}
            </a>

            {/* QR Code */}
            <div className="flex justify-center">
              <div className="rounded-2xl bg-white p-4 shadow-xl">
                <QRCodeSVG
                  value={auth.verificationUri}
                  size={160}
                  bgColor="#ffffff"
                  fgColor="#0f1117"
                  level="M"
                />
              </div>
            </div>

            {/* User Code */}
            <div className="rounded-xl bg-white/5 border border-white/10 px-6 py-4">
              <p className="text-xs text-slate-500 mb-1 uppercase tracking-widest">Code</p>
              <p className="font-mono text-4xl font-bold tracking-[0.3em] text-white">
                {auth.userCode}
              </p>
            </div>

            {/* Countdown */}
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-slate-500">Expires in</span>
              <span
                className={`font-mono font-semibold ${
                  secondsLeft < 60 ? 'text-red-400' : 'text-slate-300'
                }`}
              >
                {formatCountdown(secondsLeft)}
              </span>
              {secondsLeft === 0 && (
                <button
                  onClick={startAuth}
                  className="ml-2 text-blue-400 hover:text-blue-300 underline text-xs transition-colors"
                >
                  Refresh
                </button>
              )}
            </div>

            {/* Polling indicator */}
            {secondsLeft > 0 && (
              <div className="flex items-center justify-center gap-2 text-slate-500 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                Waiting for sign-in…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthSetup;
