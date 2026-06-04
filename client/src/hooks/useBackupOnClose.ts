import { useEffect } from 'react';

/** Request a backup when the user closes the browser tab or kiosk window. */
export function useBackupOnClose(): void {
  useEffect(() => {
    const trigger = () => {
      const body = JSON.stringify({ source: 'browser_close' });
      const url = '/api/storage/backup';
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        return;
      }
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    };

    window.addEventListener('pagehide', trigger);
    return () => window.removeEventListener('pagehide', trigger);
  }, []);
}
