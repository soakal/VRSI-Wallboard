import type { AppConfig } from '../types/index';
import { unwrap } from './http';

export async function getConfig(): Promise<AppConfig> {
  const response = await fetch('/api/config');
  return unwrap<AppConfig>(response);
}

export async function updateConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
  const response = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  return unwrap<AppConfig>(response);
}
