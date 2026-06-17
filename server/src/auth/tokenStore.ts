import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { resolveDataDir } from '../lib/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tokens.json lives in the resolved DATA_DIR (default C:\ProgramData\VRSIWallBoard\data),
// the SAME place as the DB/backups/logs — NOT under server/, so a release-zip update
// that replaces the server/ folder can never wipe the encrypted tokens (which would
// silently lock the kiosk out of auth). Resolved per-call so DATA_DIR is honored.
function tokenFilePath(): string {
  return path.join(resolveDataDir(), 'tokens.json');
}

// Legacy location used before the DATA_DIR fix: server/data/tokens.json.
// dev src/auth -> src -> server -> server/data ; prod dist/auth -> dist -> server -> server/data
const LEGACY_TOKEN_FILE_PATH = path.resolve(__dirname, '..', '..', 'data', 'tokens.json');

// Move an existing token file from the legacy server/data location to DATA_DIR
// once, so upgrading kiosks keep their auth instead of being forced to re-login.
function migrateLegacyTokenFile(): void {
  try {
    const dest = tokenFilePath();
    if (dest !== LEGACY_TOKEN_FILE_PATH && fs.existsSync(LEGACY_TOKEN_FILE_PATH) && !fs.existsSync(dest)) {
      const dir = path.dirname(dest);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.renameSync(LEGACY_TOKEN_FILE_PATH, dest);
      logger.info('Migrated tokens.json to the DATA_DIR location');
    }
  } catch (err) {
    logger.warn('Token file migration skipped', { error: err });
  }
}

export interface TokenData {
  refreshToken: string;
  accessToken: string;
  expiresOn: number;
}

function getEncryptionKey(salt: Buffer): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET environment variable is required');
  }
  return crypto.scryptSync(secret, salt, 32);
}

function encrypt(plaintext: string): { salt: string; iv: string; data: string; tag: string } {
  const salt = crypto.randomBytes(16);
  const key = getEncryptionKey(salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    data: encrypted,
    tag: tag.toString('hex'),
  };
}

function decrypt(salt: string, iv: string, encryptedData: string, tag: string): string {
  const key = getEncryptionKey(Buffer.from(salt, 'hex'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function saveTokens(data: TokenData): void {
  migrateLegacyTokenFile();
  const tokenPath = tokenFilePath();
  const plaintext = JSON.stringify(data);
  const encrypted = encrypt(plaintext);

  const dir = path.dirname(tokenPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Atomic write: temp file + rename so a crash mid-write can't corrupt the
  // token file (which would lock the kiosk out of auth).
  const tmpPath = tokenPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(encrypted), 'utf8');
  fs.renameSync(tmpPath, tokenPath);
  logger.info('Tokens saved to disk');
}

export function loadTokens(): TokenData | null {
  try {
    migrateLegacyTokenFile();
    const tokenPath = tokenFilePath();
    if (!fs.existsSync(tokenPath)) {
      logger.debug('No token file found');
      return null;
    }

    const raw = fs.readFileSync(tokenPath, 'utf8');
    const { salt, iv, data, tag } = JSON.parse(raw) as { salt: string; iv: string; data: string; tag: string };
    const plaintext = decrypt(salt, iv, data, tag);
    const tokenData = JSON.parse(plaintext) as TokenData;
    logger.info('Tokens loaded from disk');
    return tokenData;
  } catch (err) {
    logger.error('Failed to load tokens', { error: err });
    return null;
  }
}
