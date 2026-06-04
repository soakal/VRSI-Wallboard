import type { SharePointFile, SharePointSite, SharePointDrive } from '../types/index';

export async function getRecentFiles(count: number): Promise<SharePointFile[]> {
  // The server exposes recent files at /api/sharepoint/recent, not /files.
  // /api/sharepoint/files requires a driveId parameter and returns a 400 otherwise.
  const params = new URLSearchParams({ count: count.toString() });
  const response = await fetch(`/api/sharepoint/recent?${params}`);
  if (!response.ok) {
    throw new Error('Failed to get recent files');
  }
  return response.json();
}

export async function getSites(): Promise<SharePointSite[]> {
  const response = await fetch('/api/sharepoint/sites');
  if (!response.ok) {
    throw new Error('Failed to get sites');
  }
  return response.json();
}

export async function getDrives(siteId: string): Promise<SharePointDrive[]> {
  const params = new URLSearchParams({ siteId });
  const response = await fetch(`/api/sharepoint/drives?${params}`);
  if (!response.ok) {
    throw new Error('Failed to get drives');
  }
  return response.json();
}

export async function getFiles(driveId: string): Promise<SharePointFile[]> {
  const params = new URLSearchParams({ driveId });
  const response = await fetch(`/api/sharepoint/files?${params}`);
  if (!response.ok) {
    throw new Error('Failed to get files');
  }
  return response.json();
}
