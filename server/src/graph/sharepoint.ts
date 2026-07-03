import { getGraphClient } from './graphClient.js';
import { mockFiles } from './mockData.js';
import { logger } from '../utils/logger.js';

export interface GraphDriveItem {
  id: string;
  name: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  size?: number;
  file?: { mimeType: string };
  folder?: { childCount: number };
  createdBy?: { user: { displayName: string } };
  lastModifiedBy?: { user: { displayName: string } };
}

export interface GraphSite {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
}

export interface GraphDrive {
  id: string;
  name: string;
  driveType: string;
  webUrl?: string;
}

export async function listRecentFiles(count = 20): Promise<GraphDriveItem[]> {
  if (process.env.DISABLE_AZURE === 'true') {
    const { logNetworkRequest } = await import('../services/auditService.js');
    logNetworkRequest('GET', 'https://graph.microsoft.com/v1.0/me/drive/recent', true, 200, 'test mode mock — no cloud call');
    logger.info('Test mode: returning mock recent files');
    return mockFiles.slice(0, count).map((file) => ({
      id: file.id,
      name: file.name,
      webUrl: file.webUrl,
      lastModifiedDateTime: file.lastModifiedDateTime,
      size: Math.floor(Math.random() * 5000000),
    }));
  }

  const { logNetworkRequest } = await import('../services/auditService.js');
  logNetworkRequest('GET', 'https://graph.microsoft.com/v1.0/me/drive/recent', true, undefined, 'Microsoft Graph SharePoint');

  logger.debug('Fetching recent files from Graph API', { count });
  const client = getGraphClient();

  const response = await client
    .api('/me/drive/recent')
    .top(count)
    .get() as { value: GraphDriveItem[] };

  logger.info(`Fetched ${response.value.length} recent files`);
  return response.value;
}

export async function listSites(): Promise<GraphSite[]> {
  if (process.env.DISABLE_AZURE === 'true') {
    logger.info('Test mode: returning mock sites');
    return [
      {
        id: 'site-1',
        name: 'projects',
        displayName: 'Projects',
        webUrl: 'https://sharepoint.example.com/sites/projects',
      },
      {
        id: 'site-2',
        name: 'team',
        displayName: 'Team',
        webUrl: 'https://sharepoint.example.com/sites/team',
      },
    ];
  }

  logger.debug('Fetching SharePoint sites from Graph API');
  const client = getGraphClient();

  const response = await client
    .api('/sites')
    .query({ search: '*' })
    .select('id,name,displayName,webUrl')
    .get() as { value: GraphSite[] };

  logger.info(`Fetched ${response.value.length} sites`);
  return response.value;
}

export async function listDrives(siteId: string): Promise<GraphDrive[]> {
  if (process.env.DISABLE_AZURE === 'true') {
    logger.info('Test mode: returning mock drives');
    return [
      {
        id: 'drive-1',
        name: 'Documents',
        driveType: 'documentLibrary',
        webUrl: 'https://sharepoint.example.com/sites/projects/documents',
      },
    ];
  }

  logger.debug('Fetching drives for site', { siteId });
  const client = getGraphClient();

  const response = await client
    .api(`/sites/${encodeURIComponent(siteId)}/drives`)
    .select('id,name,driveType,webUrl')
    .get() as { value: GraphDrive[] };

  logger.info(`Fetched ${response.value.length} drives for site ${siteId}`);
  return response.value;
}

export async function listFiles(driveId: string): Promise<GraphDriveItem[]> {
  if (process.env.DISABLE_AZURE === 'true') {
    logger.info('Test mode: returning mock files for drive');
    return mockFiles.map((file) => ({
      id: file.id,
      name: file.name,
      webUrl: file.webUrl,
      lastModifiedDateTime: file.lastModifiedDateTime,
      size: Math.floor(Math.random() * 5000000),
    }));
  }

  logger.debug('Fetching files for drive', { driveId });
  const client = getGraphClient();

  const response = await client
    .api(`/drives/${encodeURIComponent(driveId)}/root/children`)
    .select('id,name,webUrl,lastModifiedDateTime,size,file,folder,createdBy,lastModifiedBy')
    .get() as { value: GraphDriveItem[] };

  logger.info(`Fetched ${response.value.length} files for drive ${driveId}`);
  return response.value;
}
