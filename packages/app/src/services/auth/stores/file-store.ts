import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type {
  AccessTokenData,
  AuthCodeData,
  AuthStore,
  RefreshTokenData,
  SessionData,
} from './types.js';
import { logger } from '@/utils/logger';

interface AuthStoreSnapshot {
  version: 1;
  sessions: SessionData[];
  authCodes: AuthCodeData[];
  accessTokens: AccessTokenData[];
  refreshTokens: RefreshTokenData[];
}

function createEmptySnapshot(): AuthStoreSnapshot {
  return {
    version: 1,
    sessions: [],
    authCodes: [],
    accessTokens: [],
    refreshTokens: [],
  };
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function upsertByKey<T>(items: T[], nextItem: T, getKey: (item: T) => string): T[] {
  const nextKey = getKey(nextItem);
  const nextItems = items.filter(item => getKey(item) !== nextKey);
  nextItems.push(cloneValue(nextItem));
  return nextItems;
}

export class FileAuthStore implements AuthStore {
  private persistQueue: Promise<void> = Promise.resolve();

  private constructor(
    private readonly filePath: string,
    private snapshot: AuthStoreSnapshot,
  ) {}

  static async create(filePath: string): Promise<FileAuthStore> {
    const snapshot = await FileAuthStore.loadSnapshot(filePath);
    logger.info('Creating file auth store', { filePath });
    return new FileAuthStore(filePath, snapshot);
  }

  private static async loadSnapshot(filePath: string): Promise<AuthStoreSnapshot> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content) as Partial<AuthStoreSnapshot>;

      return {
        version: 1,
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        authCodes: Array.isArray(parsed.authCodes) ? parsed.authCodes : [],
        accessTokens: Array.isArray(parsed.accessTokens) ? parsed.accessTokens : [],
        refreshTokens: Array.isArray(parsed.refreshTokens) ? parsed.refreshTokens : [],
      };
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        logger.warn('Failed to load auth store snapshot, fallback to empty store', {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return createEmptySnapshot();
    }
  }

  private async persist(): Promise<void> {
    this.persistQueue = this.persistQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, JSON.stringify(this.snapshot, null, 2), 'utf-8');
      await rename(tempPath, this.filePath);
    });

    await this.persistQueue;
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    const session = this.snapshot.sessions.find(item => item.sessionId === sessionId);
    return session ? cloneValue(session) : null;
  }

  async setSession(session: SessionData): Promise<void> {
    this.snapshot.sessions = upsertByKey(this.snapshot.sessions, session, item => item.sessionId);
    await this.persist();
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.snapshot.sessions = this.snapshot.sessions.filter(item => item.sessionId !== sessionId);
    await this.persist();
  }

  async getAuthCode(code: string): Promise<AuthCodeData | null> {
    const authCode = this.snapshot.authCodes.find(item => item.code === code);
    return authCode ? cloneValue(authCode) : null;
  }

  async setAuthCode(data: AuthCodeData): Promise<void> {
    this.snapshot.authCodes = upsertByKey(this.snapshot.authCodes, data, item => item.code);
    await this.persist();
  }

  async deleteAuthCode(code: string): Promise<void> {
    this.snapshot.authCodes = this.snapshot.authCodes.filter(item => item.code !== code);
    await this.persist();
  }

  async getAccessToken(token: string): Promise<AccessTokenData | null> {
    const accessToken = this.snapshot.accessTokens.find(item => item.token === token);
    return accessToken ? cloneValue(accessToken) : null;
  }

  async setAccessToken(data: AccessTokenData): Promise<void> {
    this.snapshot.accessTokens = upsertByKey(this.snapshot.accessTokens, data, item => item.token);
    this.snapshot.refreshTokens = this.snapshot.refreshTokens.filter(
      item => item.refreshToken !== data.refreshToken && item.accessToken !== data.token,
    );
    this.snapshot.refreshTokens.push({
      refreshToken: data.refreshToken,
      accessToken: data.token,
    });
    await this.persist();
  }

  async deleteAccessToken(token: string): Promise<void> {
    const deletedToken = this.snapshot.accessTokens.find(item => item.token === token);
    this.snapshot.accessTokens = this.snapshot.accessTokens.filter(item => item.token !== token);

    if (deletedToken) {
      this.snapshot.refreshTokens = this.snapshot.refreshTokens.filter(
        item => item.refreshToken !== deletedToken.refreshToken,
      );
    }

    await this.persist();
  }

  async getRefreshToken(refreshToken: string): Promise<RefreshTokenData | null> {
    const refreshData = this.snapshot.refreshTokens.find(item => item.refreshToken === refreshToken);
    return refreshData ? cloneValue(refreshData) : null;
  }

  async setRefreshToken(data: RefreshTokenData): Promise<void> {
    this.snapshot.refreshTokens = upsertByKey(
      this.snapshot.refreshTokens,
      data,
      item => item.refreshToken,
    );
    await this.persist();
  }

  async deleteRefreshToken(refreshToken: string): Promise<void> {
    this.snapshot.refreshTokens = this.snapshot.refreshTokens.filter(
      item => item.refreshToken !== refreshToken,
    );
    await this.persist();
  }
}

export async function createFileAuthStore(filePath: string): Promise<AuthStore> {
  return FileAuthStore.create(filePath);
}