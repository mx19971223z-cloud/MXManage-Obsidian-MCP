#!/usr/bin/env node
/**
 * 本地 HTTP 服务（OAuth 2.0）
 *
 * 提供完整 OAuth 2.0 授权码流程（含 PKCE）
 * 使用内存会话存储
 * 可用于 ChatGPT / Claude 等远程客户端接入
 *
 * 用法：
 *   npm run dev:http
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express from 'express';
import { GitVaultManager } from '@/services/git-vault-manager';
import { registerTools } from '@/mcp/tool-registrations';
import { registerResources } from '@/mcp/resource-registrations';
import { registerOAuthRoutes } from '@/server/shared/oauth-routes';
import { registerMcpRoute } from '@/server/shared/mcp-routes';
import { createInMemoryAuthStore } from '@/services/auth/stores';
import { setAuthStore } from '@/services/auth';
import { loadEnv, ensureEnvVars } from '@/env';
import { MCP_SERVER_INSTRUCTIONS } from '@/server/shared/instructions';
import { configureLogger } from '@/utils/logger';

loadEnv();

configureLogger({
  stream: process.stdout,
  minLevel: (process.env.LOG_LEVEL as any) || 'info',
});

try {
  ensureEnvVars();
} catch (error: any) {
  console.error('✗ 环境变量配置无效：%s', error.message);
  console.error('  请创建 .env（参考 .env.example）或通过系统环境变量注入。');
  process.exit(1);
}

setAuthStore(createInMemoryAuthStore());

const LOCAL_VAULT_PATH = process.env.LOCAL_VAULT_PATH || './vault-local';
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || 'obsidian-mcp-client';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (!OAUTH_CLIENT_SECRET) {
  console.error('✗ 缺少 OAUTH_CLIENT_SECRET！');
  console.error('  请在 .env 或系统环境变量中配置。');
  process.exit(1);
}

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

registerTools(mcpServer, () => vaultManager);
registerResources(mcpServer, () => vaultManager);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

registerOAuthRoutes(app, {
  clientId: OAUTH_CLIENT_ID,
  clientSecret: OAUTH_CLIENT_SECRET,
  baseUrl: BASE_URL,
});

registerMcpRoute(app, mcpServer);

const PORT = parseInt(process.env.PORT || '3000');

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  Obsidian MCP Server（OAuth 2.0 已启用）                 ║
╠═══════════════════════════════════════════════════════════╣
║  Server:     ${BASE_URL.padEnd(49)}║
║  Vault:      ${LOCAL_VAULT_PATH.padEnd(49)}║
║  Client ID:  ${OAUTH_CLIENT_ID.padEnd(49)}║
╚═══════════════════════════════════════════════════════════╝

OAuth 2.0 端点：
  授权端点:      ${BASE_URL}/oauth/authorize
  Token 端点:    ${BASE_URL}/oauth/token
  注册端点:      ${BASE_URL}/oauth/register
  吊销端点:      ${BASE_URL}/oauth/revoke
  发现文档:      ${BASE_URL}/.well-known/oauth-authorization-server

MCP 端点（需要 Bearer Token）：
  POST ${BASE_URL}/mcp

健康检查：
  GET ${BASE_URL}/health

在 ChatGPT/Claude 中配置：
  - Client ID: ${OAUTH_CLIENT_ID}
  - Client Secret: ${OAUTH_CLIENT_SECRET}
  - Authorization URL: ${BASE_URL}/oauth/authorize
  - Token URL: ${BASE_URL}/oauth/token
  `);
});
