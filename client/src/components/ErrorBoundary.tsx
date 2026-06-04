import React, { ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  countdown: number;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, countdown: 30 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error, info);
    this.startCountdown();
  }

  private startCountdown(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.setState(
        (prev) => ({ countdown: Math.max(0, prev.countdown - 1) }),
        () => {
          if (this.state.countdown <= 0) {
            if (this.intervalId) {
              clearInterval(this.intervalId);
              this.intervalId = null;
            }
            window.location.reload();
          }
        }
      );
    }, 1000);
  }

  componentWillUnmount(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0f1117] text-slate-200 p-8">
        <div className="max-w-md w-full rounded-2xl bg-white/5 border border-white/10 p-8 text-center space-y-6">
          <img src="/logos/vrsi-icon-white.png" alt="VRSI" className="h-8 w-auto mx-auto mb-4" />
          <div className="text-5xl">⚠️</div>
          <div>
            <h1 className="text-2xl font-semibold text-white mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-400">
              VRSI Calendar encountered an unexpected error.
            </p>
          </div>

          {this.state.error && (
            <pre className="text-left text-xs bg-black/40 rounded-lg p-3 text-red-300 overflow-auto max-h-32 whitespace-pre-wrap break-all">
              {this.state.error.message}
            </pre>
          )}

          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Automatically reloading in{' '}
              <span className="font-bold text-white text-lg">{this.state.countdown}</span>s
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Reload Now
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
