import type { SharePointFile, SharePointSite, SharePointDrive } from '../types/index';
import { unwrap } from './http';

export async function getRecentFiles(count: number): Promise<SharePointFile[]> {
  // The server exposes recent files at /api/sharepoint/recent, not /files.
  // /api/sharepoint/files requires a driveId parameter and returns a 400 otherwise.
  const params = new URLSearchParams({ count: count.toString() });
  const response = await fetch(`/api/sharepoint/recent?${params}`);
  return unwrap<SharePointFile[]>(response);
}

export async function getSites(): Promise<SharePointSite[]> {
  const response = await fetch('/api/sharepoint/sites');
  return unwrap<SharePointSite[]>(response);
}

export async function getDrives(siteId: string): Promise<SharePointDrive[]> {
  const params = new URLSearchParams({ siteId });
  const response = await fetch(`/api/sharepoint/drives?${params}`);
  return unwrap<SharePointDrive[]>(response);
}

export async function getFiles(driveId: string): Promise<SharePointFile[]> {
  const params = new URLSearchParams({ driveId });
  const response = await fetch(`/api/sharepoint/files?${params}`);
  return unwrap<SharePointFile[]>(response);
}
