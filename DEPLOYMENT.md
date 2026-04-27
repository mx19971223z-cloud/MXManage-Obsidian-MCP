# 🚀 部署与运行指南

本文档整合了部署说明、开发命令与 Git 提供商认证配置。

## 🛠️ 开发命令

在项目根目录下执行：

- `npm install`：安装依赖
- `npm run build`：构建应用
- `npm run dev`：启动 stdio 模式（开发/本地）
- `npm run dev:http`：启动 http 模式（开发/远程）
- `npm run test`：运行单元测试
- `npm run lint`：代码检查

## 📦 部署前准备

### 基础依赖

- Node.js 22+
- npm 10+
- Git
- 可访问的远端 Git 仓库（作为 Obsidian Vault）

### 环境变量

复制模板：

cp .env.example .env

基础必填：

VAULT_REPO=https://github.com/username/vault-repo.git
VAULT_BRANCH=main
GIT_TOKEN=your_token

JOURNAL_PATH_TEMPLATE=Journal/{{date}}.md
JOURNAL_DATE_FORMAT=YYYY-MM-DD
JOURNAL_ACTIVITY_SECTION=## Activity
JOURNAL_FILE_TEMPLATE=Templates/Daily Note.md

HTTP OAuth 必填：

OAUTH_CLIENT_ID=obsidian-mcp-client
OAUTH_CLIENT_SECRET=replace_with_secret
PERSONAL_AUTH_TOKEN=replace_with_personal_token
BASE_URL=http://localhost:3000

可选：

GIT_USERNAME=your_username
LOCAL_VAULT_PATH=./vault-local
PORT=3000
SESSION_EXPIRY_MS=86400000

## 二、运行方式

### 本地 stdio（推荐本地客户端）

npm install
npm run dev

适用：Claude Desktop、Cursor 等本地 MCP 调用场景。

### 本地 http（远程客户端）

npm install
npm run dev:http

默认端口 3000，可通过 PORT 覆盖。

## 三、Docker 部署

### 构建镜像

docker build -t mxmanage-obsidian-mcp .

### 启动 http 模式

docker run -d \
  --name mxmanage-obsidian-mcp \
  -p 3000:3000 \
  --env-file .env \
  -v ${PWD}/vault-local:/app/vaults/vault-local \
  mxmanage-obsidian-mcp http

### 启动 stdio 模式

docker run -i --rm --env-file .env mxmanage-obsidian-mcp stdio

## 四、OAuth 客户端接入

在客户端中配置：

- Authorization Type: OAuth 2.0
- Client ID: OAUTH_CLIENT_ID
- Client Secret: OAUTH_CLIENT_SECRET
- Authorize URL: ${BASE_URL}/oauth/authorize
- Token URL: ${BASE_URL}/oauth/token
- MCP Endpoint: ${BASE_URL}/mcp

首次连接会跳转登录页，输入 PERSONAL_AUTH_TOKEN 完成授权。

## 五、Git 提供商配置（整合原 GIT_PROVIDERS.md）

### 1. 支持范围

- GitHub：Personal Access Token
- GitLab：Personal Access Token
- Gitee：私人令牌（Personal Access Token）
- 自建/通用 Git：Token 或密码 + GIT_USERNAME

### 2. 自动识别规则

- host 包含 github.com：使用 x-access-token 鉴权格式
- host 包含 gitlab：使用 oauth2 鉴权格式
- host 包含 gitee.com：使用 username:token 鉴权格式（默认为 oauth2:token）
- 其他 host：使用基础鉴权（username:token）

### 3. 各平台配置示例

GitHub：

VAULT_REPO=https://github.com/username/repository.git
VAULT_BRANCH=main
GIT_TOKEN=ghp_xxx

GitLab（含自建）：

VAULT_REPO=https://gitlab.com/username/repository.git
VAULT_BRANCH=main
GIT_TOKEN=glpat-xxx

Gitee：

VAULT_REPO=https://gitee.com/username/repository.git
VAULT_BRANCH=master
GIT_TOKEN=your_gitee_token

自建/通用：

VAULT_REPO=https://git.example.com/username/repository.git
VAULT_BRANCH=main
GIT_TOKEN=your_token_or_password
GIT_USERNAME=your_username

### 4. 认证 URL 生成格式

GitHub：
https://x-access-token:TOKEN@github.com/user/repo.git

GitLab：
https://oauth2:TOKEN@gitlab.com/user/repo.git

Gitee：
https://oauth2:TOKEN@gitee.com/user/repo.git （或 USERNAME:TOKEN）

自建/通用：
https://USERNAME:TOKEN@git.example.com/user/repo.git

## 六、生产环境建议

- 使用 Nginx/Caddy 暴露 HTTPS
- BASE_URL 必须与公网访问地址一致
- 强随机 OAUTH_CLIENT_SECRET 与 PERSONAL_AUTH_TOKEN
- 最小权限配置 GIT_TOKEN
- 定期轮换访问凭据
- 仅开放必要端口，限制来源 IP

## 七、排障建议

- 认证失败：检查 BASE_URL、Client ID/Secret、Token URL 是否一致
- Git 推送失败：检查仓库权限与 GIT_TOKEN 作用域
- 自建 Git 失败：确认已设置 GIT_USERNAME
- Docker 无法写入：检查 vault-local 挂载目录权限
