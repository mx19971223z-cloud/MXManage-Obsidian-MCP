<<<<<<< HEAD
# ================= Stage 1: Dependency Initializer =================
FROM node:22-slim AS base
WORKDIR /app
# 设置 NPM 镜像源加速
RUN npm config set registry https://registry.npmmirror.com
=======
# 多阶段构建：尽量缩小最终镜像体积
FROM registry.aliyuncs.com/library/node:22-slim AS builder
>>>>>>> ff599372f582b843cd492a6b31ada25a7377079c

# ================= Stage 2: Builder =================
FROM base AS builder
# 复制根目录与 Workspace 配置文件
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/app/package.json ./packages/app/

# 仅安装构建所需的依赖 (利用缓存)
RUN npm ci --workspace @obsidian-mcp/app --include-workspace-root

# 复制源码并构建
COPY packages/app/src ./packages/app/src
COPY packages/app/tsconfig.json ./packages/app/
RUN npm run build:stdio --workspace @obsidian-mcp/app && \
    npm run build:http --workspace @obsidian-mcp/app

<<<<<<< HEAD
# ================= Stage 3: Runner =================
FROM node:22-slim AS runner
=======
# 运行阶段：使用精简 Node.js 镜像
FROM registry.aliyuncs.com/library/node:22-slim

>>>>>>> ff599372f582b843cd492a6b31ada25a7377079c
WORKDIR /app

# 安装必要的运行时工具
RUN apt-get update && \
    apt-get install -y git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 设置生产环境环境变量
ENV NODE_ENV=production \
    NODE_OPTIONS="--no-warnings" \
    LOCAL_VAULT_PATH=/app/vaults/vault-local

# 1. 复制 package 配置文件以安装生产依赖
COPY package.json package-lock.json ./
COPY packages/app/package.json ./packages/app/

# 2. 关键：只安装生产环境依赖 (omit=dev), 这将大大缩小体积并确保运行时有 node_modules
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci --omit=dev --workspace @obsidian-mcp/app --include-workspace-root

# 3. 复制编译后的产物，保留其在工作区中的相对路径，以确保能够正确解析 node_modules
COPY --from=builder /app/packages/app/dist ./packages/app/dist

# 4. 创建必要的目录
RUN mkdir -p /app/vaults

# 5. 编写启动脚本 (通过环境变量或参数控制模式)
COPY <<'EOF' /app/entrypoint.sh
#!/bin/sh
set -e
MODE="${1:-stdio}"
case "$MODE" in
  stdio) exec node packages/app/dist/stdio/index.js ;;
  http)  exec node packages/app/dist/http/index.js ;;
  *)     echo "Invalid mode: $MODE"; exit 1 ;;
esac
EOF

RUN chmod +x /app/entrypoint.sh
EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["stdio"]
