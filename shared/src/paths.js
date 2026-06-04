import path from 'path';
/** Windows-default data root; override with DATA_DIR in .env */
export function resolveDataDir() {
    const override = process.env.DATA_DIR?.trim();
    if (override)
        return path.resolve(override);
    if (process.platform === 'win32') {
        return path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'VRSIWallBoard', 'data');
    }
    return path.resolve(process.cwd(), 'data');
}
export function resolveBackupDir() {
    const override = process.env.BACKUP_DIR?.trim();
    if (override)
        return path.resolve(override);
    if (process.platform === 'win32') {
        return path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'VRSIWallBoard', 'backups');
    }
    return path.resolve(process.cwd(), 'backups');
}
export function resolveLogsDir() {
    if (process.platform === 'win32') {
        return path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'VRSIWallBoard', 'logs');
    }
    return path.resolve(process.cwd(), 'logs');
}
export function dbPath(dataDir) {
    return path.join(dataDir, 'wallboard.db');
}
