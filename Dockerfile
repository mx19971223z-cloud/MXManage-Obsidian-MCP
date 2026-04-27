# 多阶段构建：尽量缩小最终镜像体积
FROM node:22-slim AS builder

WORKDIR /build

# 复制工作区基础文件
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/app/package.json ./packages/app/

# 安装依赖
RUN npm ci --workspace @obsidian-mcp/app --include-workspace-root

# 复制源码与构建配置
COPY packages/app/src ./packages/app/src
COPY packages/app/tsconfig.json ./packages/app/

# 构建 stdio 与 http 两种运行产物
RUN npm run build:stdio --workspace @obsidian-mcp/app && \
    npm run build:http --workspace @obsidian-mcp/app

# 运行阶段：使用精简 Node.js 镜像
FROM node:22-slim

WORKDIR /app

# 安装 git（运行时 simple-git 依赖）
RUN apt-get update && \
    apt-get install -y git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 从构建阶段复制产物
COPY --from=builder /build/packages/app/dist/stdio/index.js ./dist/stdio/index.js
COPY --from=builder /build/packages/app/dist/http/index.js ./dist/http/index.js

# 内联创建启动脚本
RUN cat > /app/entrypoint.sh <<'EOF'
#!/bin/sh
set -e

# 未传参数时默认使用 stdio 模式
MODE="${1:-stdio}"

case "$MODE" in
  stdio)
    echo "以 stdio 模式启动 Obsidian MCP Server..."
    exec node dist/stdio/index.js
    ;;
  http)
    echo "以 http 模式启动 Obsidian MCP Server..."
    exec node dist/http/index.js
    ;;
  *)
    echo "错误：无效模式 '$MODE'，仅支持 'stdio' 或 'http'。"
    echo "用法：docker run ... obsidian-mcp [stdio|http]"
    echo "  stdio（默认）- 本地 MCP 客户端使用"
    echo "  http          - 以 HTTP 模式监听 3000 端口"
    exit 1
    ;;
esac
EOF

RUN chmod +x /app/entrypoint.sh

# 设置默认环境变量
ENV NODE_ENV=production \
    NODE_OPTIONS="--no-warnings" \
    LOCAL_VAULT_PATH=/app/vaults/vault-local

# 创建 git 仓库本地克隆目录（Vault 存储）
RUN mkdir -p /app/vaults

# 暴露 HTTP 模式端口（传入 'http' 参数时生效）
EXPOSE 3000

# 通过自定义启动脚本选择运行模式
# 默认 stdio
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["stdio"]
