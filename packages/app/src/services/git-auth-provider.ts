type GitProvider = 'github' | 'gitlab' | 'gitee' | 'generic';

/**
 * 识别 Git 服务商类型
 * @param repoUrl 仓库 URL
 * @returns 服务商类型
 */
function detectProvider(repoUrl: string): GitProvider {
  try {
    const url = new URL(repoUrl);
    const hostname = url.hostname.toLowerCase();

    if (hostname === 'github.com') {
      return 'github';
    }

    if (hostname === 'gitlab.com' || hostname.includes('gitlab')) {
      return 'gitlab';
    }

    if (hostname === 'gitee.com') {
      return 'gitee';
    }

    return 'generic';
  } catch {
    throw new Error(`Invalid repository URL: ${repoUrl}`);
  }
}

function buildAuthenticatedUrl(
  repoUrl: string,
  token: string,
  provider: GitProvider,
  username?: string,
): string {
  try {
    const url = new URL(repoUrl);

    switch (provider) {
      case 'github':
        url.username = 'x-access-token';
        url.password = token;
        break;

      case 'gitlab':
        url.username = 'oauth2';
        url.password = token;
        break;

      case 'gitee':
        // Gitee 通常使用 https://{username}:{token}@gitee.com/path.git
        // 如果没有提供用户名，我们尝试从环境变量或 URL 中提取，或者使用 token 作为占位符
        // 实际上 Gitee 鉴权主要看 token，用户名如果是个人令牌可以随便填（通常建议匹配）
        url.username = username || 'oauth2'; 
        url.password = token;
        break;

      case 'generic':
        if (!username) {
          throw new Error(
            `GIT_USERNAME environment variable is required for self-hosted git provider: ${url.hostname}`,
          );
        }
        url.username = username;
        url.password = token;
        break;

      default:
        throw new Error(`Unknown git provider: ${provider}`);
    }

    return url.toString();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to build authenticated URL: ${error}`);
  }
}

export function getAuthenticatedGitUrl(repoUrl: string, token: string, username?: string): string {
  const provider = detectProvider(repoUrl);
  return buildAuthenticatedUrl(repoUrl, token, provider, username);
}
