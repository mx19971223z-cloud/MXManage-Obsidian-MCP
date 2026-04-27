#!/usr/bin/env node
/**
 * 本地 MCP 服务启动器
 *
 * 使用 stdio 传输在本地运行 Obsidian MCP 服务。
 * 适合 Claude Desktop 或其他 MCP 客户端本地调试。
 *
 * 用法：
 *   npm run dev
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GitVaultManager } from '@/services/git-vault-manager';
import { registerTools } from '@/mcp/tool-registrations';
import { registerResources } from '@/mcp/resource-registrations';
import { loadEnv, ensureCoreEnvVars } from '@/env';
import { MCP_SERVER_INSTRUCTIONS } from '@/server/shared/instructions';
import { configureLogger } from '@/utils/logger';

loadEnv();

// 日志输出到 stderr（stdout 预留给 JSON-RPC 协议）
configureLogger({
  stream: process.stderr,
  minLevel: (process.env.LOG_LEVEL as any) || 'info',
});

try {
  ensureCoreEnvVars();
} catch (error: any) {
  console.error('环境变量配置无效：%s', error.message);
  console.error('请创建 .env（参考 .env.example）或通过系统环境变量注入。');
  process.exit(1);
}

const LOCAL_VAULT_PATH = process.env.LOCAL_VAULT_PATH || './vault-local';

const vaultManager = new GitVaultManager({
  repoUrl: process.env.VAULT_REPO!,
  branch: process.env.VAULT_BRANCH!,
  gitToken: process.env.GIT_TOKEN!,
  gitUsername: process.env.GIT_USERNAME,
  vaultPath: LOCAL_VAULT_PATH,
});

const mcpServer = new McpServer({
  name: 'obsidian-mcp',
  version: '1.0.0',
  instructions: MCP_SERVER_INSTRUCTIONS,
});

console.error('正在启动 Obsidian MCP Server（本地模式）...');
console.error(`Vault 路径：${LOCAL_VAULT_PATH}`);

registerTools(mcpServer, () => vaultManager);
registerResources(mcpServer, () => vaultManager);

const transport = new StdioServerTransport();
await mcpServer.connect(transport);

console.error('MCP Server 已通过 stdio 启动');
console.error('已准备好接收 MCP 客户端请求');
