import type { AuthStatusResponse, AuthStartResponse } from '../types/index';

export async function getAuthStatus(): Promise<AuthStatusResponse> {
  const response = await fetch('/api/auth/status');
  if (!response.ok) {
    throw new Error('Failed to get auth status');
  }
  return response.json();
}

export async function startAuth(): Promise<AuthStartResponse> {
  const response = await fetch('/api/auth/start', {
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error('Failed to start auth flow');
  }
  return response.json();
}
