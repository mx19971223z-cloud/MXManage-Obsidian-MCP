import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { dirname, join } from 'path';

// 所有运行模式都需要的核心环境变量
export const CORE_ENV_VARS = [
  'VAULT_REPO',
  'VAULT_BRANCH',
  'GIT_TOKEN',
  'JOURNAL_PATH_TEMPLATE',
  'JOURNAL_DATE_FORMAT',
  'JOURNAL_ACTIVITY_SECTION',
  'JOURNAL_FILE_TEMPLATE',
] as const;

// OAuth 相关环境变量（仅 HTTP 模式）
export const OAUTH_ENV_VARS = [
  'OAUTH_CLIENT_ID',
  'OAUTH_CLIENT_SECRET',
  'PERSONAL_AUTH_TOKEN',
  'BASE_URL',
] as const;

// HTTP 模式所需的完整环境变量集合
export const REQUIRED_ENV_VARS = [...CORE_ENV_VARS, ...OAUTH_ENV_VARS] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];
export type CoreEnvVar = (typeof CORE_ENV_VARS)[number];
export type OAuthEnvVar = (typeof OAUTH_ENV_VARS)[number];

/**
 * 递归向上查找目录树中的 .env 文件
 * @param startDir 查找起始目录
 * @returns 找到时返回 .env 文件路径，否则返回 undefined
 */
function findEnvFile(startDir: string): string | undefined {
  let currentDir = startDir;

  while (true) {
    const envPath = join(currentDir, '.env');

    if (existsSync(envPath)) {
      return envPath;
    }

    const parentDir = dirname(currentDir);

    // 已到达文件系统根目录
    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

export function loadEnv(): void {
  const envPath = findEnvFile(process.cwd());

  const result = envPath ? dotenv.config({ path: envPath }) : dotenv.config(); // 回退到 dotenv 默认查找行为

  if (result.error && (result.error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw result.error;
  }
}

export function ensureEnvVars(variables: Iterable<RequiredEnvVar> = REQUIRED_ENV_VARS): void {
  const missing = Array.from(variables).filter(key => !process.env[key] || process.env[key] === '');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// stdio 模式便捷校验函数（无需 OAuth）
export function ensureCoreEnvVars(): void {
  ensureEnvVars(CORE_ENV_VARS);
}
