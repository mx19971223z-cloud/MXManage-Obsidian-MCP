import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { VaultManager } from '@/services/vault-manager';

/**
 * 向服务端注册 MCP 资源
 *
 * 资源用于向 LLM 提供 Vault 的上下文信息，
 * 避免在不需要时提前加载全部数据。
 */
export function registerResources(server: McpServer, getVaultManager: () => VaultManager): void {
  server.registerResource(
    'vault-readme',
    'obsidian://vault-readme',
    {
      name: 'Vault README',
      description:
        'README.md from the vault root containing vault organization guidelines and structure',
      mimeType: 'text/markdown',
      annotations: {
        readOnlyHint: true,
        openWorldHint: true, // 与 Git 托管的 Vault 交互
      },
    },
    async uri => {
      const vault = getVaultManager();

      try {
        const readmeExists = await vault.fileExists('README.md');

        if (!readmeExists) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'text/markdown',
                text: 'Vault 根目录未找到 README.md。',
              },
            ],
          };
        }

        const content = await vault.readFile('README.md');

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: content,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : '读取 README.md 时发生未知错误';

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: `读取 Vault README 失败：${errorMessage}`,
            },
          ],
        };
      }
    },
  );
}
