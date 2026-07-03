import type { AuthStatusResponse, AuthStartResponse } from '../types/index';
import { unwrap } from './http';

export async function getAuthStatus(): Promise<AuthStatusResponse> {
  const response = await fetch('/api/auth/status');
  return unwrap<AuthStatusResponse>(response);
}

export async function startAuth(): Promise<AuthStartResponse> {
  const response = await fetch('/api/auth/start', {
    method: 'POST'
  });
  return unwrap<AuthStartResponse>(response);
}
