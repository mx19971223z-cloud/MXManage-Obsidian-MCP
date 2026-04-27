/**
 * 共享 MCP 路由
 *
 * 本地 HTTP 服务使用的 MCP 端点处理器
 */

import { Express, Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as auth from '@/services/auth';
import { logger } from '@/utils/logger';

/**
 * OAuth 中间件：校验 Bearer Token
 */
async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'unauthorized',
      error_description: 'Missing or invalid Authorization header',
    });
    return;
  }

  const token = authHeader.substring(7);

  if (!(await auth.validateAccessToken(token))) {
    res.status(401).json({
      error: 'invalid_token',
      error_description: 'Access token is invalid or expired',
    });
    return;
  }

  next();
}

/**
 * 在 Express 应用上注册 MCP 端点
 *
 * MCP 端点始终要求 OAuth 访问令牌。
 *
 * @param app - Express 应用实例
 * @param mcpServer - MCP 服务实例
 */
export function registerMcpRoute(app: Express, mcpServer: McpServer): void {
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      oauth: 'enabled',
      vault: process.env.LOCAL_VAULT_PATH || process.env.VAULT_REPO_URL || 'configured',
    });
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      error: 'method_not_allowed',
      error_description: '当前端点不支持 SSE 流式连接',
    });
  });

  const mcpHandler = async (req: Request, res: Response) => {
    const startTime = Date.now();
    const method = req.body?.method || 'unknown';
    const requestId = req.body?.id;

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      transport.close();
    });

    try {
      logger.debug('MCP request received', {
        method,
        requestId,
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);

      logger.info('MCP request completed', {
        method,
        requestId,
        durationMs: Date.now() - startTime,
        success: true,
      });
    } catch (error) {
      logger.error('Error handling MCP request', {
        error,
        method,
        requestId,
        durationMs: Date.now() - startTime,
      });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : 'Unknown error',
          },
          id: null,
        });
      }
    }
  };

  app.post('/mcp', authenticateToken, mcpHandler);
}
