# Obsidian MCP Server 使用指南

本指南详细介绍了如何配置、部署以及在 AI 客户端（如 Claude Desktop, Cursor）中使用此 Obsidian MCP Server。

---

## 1. 前期准备与配置

在运行 MCP Server 之前，你需要配置环境变量以接入你的 Obsidian 仓库。

### 1.1 创建配置文件
在项目根目录下，将 `.env.example` 复制为 `.env`：
```powershell
cp .env.example .env
```

### 1.2 配置核心参数
编辑 `.env` 文件，填入以下必要信息：

| 变量名 | 说明 | 示例 |
| :--- | :--- | :--- |
| `VAULT_REPO` | Obsidian 库的 Git 仓库地址 | `https://github.com/user/my-notes.git` |
| `VAULT_BRANCH` | 使用的分支名 | `main` |
| `GIT_TOKEN` | 具有仓库读写权限的个人访问令牌 (PAT) | `ghp_xxxxxxxxxxxx` |
| `OAUTH_CLIENT_SECRET` | 自定义的 OAuth 密钥（HTTP 模式鉴权使用） | `随便填一串随机字符` |
| `PERSONAL_AUTH_TOKEN` | 自定义的个人认证令牌 | `随便填一串随机字符` |

---

## 2. 运行方式

本项目支持 **Docker Compose (HTTP 模式)** 和 **Direct Docker (Stdio 模式)** 两种运行方式。

### 2.1 方式 A：Docker Compose (推荐用于后台常驻/远程调用)
适用于需要通过 HTTP 协议从外部或网页端 AI 接入的场景。

```powershell
# 一键启动（含镜像构建）
docker-compose up -d --build

# 查看运行状态与日志
docker-compose logs -f
```
*服务默认运行在 `http://localhost:3000`。*

### 2.2 方式 B：Stdio 模式 (最推荐，性能最佳)
适用于 **Claude Desktop**、**Cursor** 等本地桌面客户端。这种方式不需要常驻后台，由客户端按需启动。

---

## 3. 在 AI 客户端中接入

### 3.1 接入 Cursor / Windsurf / Copilot 等支持的客户端
1. 进入 **Settings -> Features -> MCP**。
2. 点击 **Add New MCP Server**：
   - **Name**: `Obsidian`
   - **Type**: `command`
   - **Command**:
     ```bash
     docker run -i --rm --env-file d:/Code/MCP/MXManage-Obsidian-MCP/.env -v d:/Code/MCP/MXManage-Obsidian-MCP/vaults:/app/vaults obsidian-mcp:latest stdio
     ```

### 3.2 接入 Claude Desktop
编辑 `%APPDATA%\Claude\claude_desktop_config.json`：
```json
{
  "mcpServers": {
    "obsidian": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--env-file",
        "d:/Code/MCP/MXManage-Obsidian-MCP/.env",
        "-v",
        "d:/Code/MCP/MXManage-Obsidian-MCP/vaults:/app/vaults",
        "obsidian-mcp:latest",
        "stdio"
      ]
    }
  }
}
```

---

## 4. 可用命令与工具

一旦成功接入，你可以命令 AI 执行以下操作（无需记忆复杂指令，直接用自然语言描述）：

*   **读取笔记**：例如 "帮我读一下最近关于 AI 的那篇笔记内容"。
*   **搜索内容**：例如 "我的笔记里提到过关于 'Docker 优化' 的内容吗？"。
*   **创建/更新笔记**：例如 "把今天的会议纪要整理成一份日记"。
*   **Git 同步**：MCP 会在后台自动处理 Git 的 pull/push 操作，确保你的 Obsidian 库始终处于同步状态。

---

## 5. 常见问题 (FAQ)

- **Q: 为什么 AI 提示找不到文件？**
  - A: 请检查 `.env` 中的 `VAULT_REPO` 是否正确，以及 `vaults/` 目录是否具有写权限。
- **Q: 修改了代码后如何生效？**
  - A: 重新执行 `docker-compose up -d --build` 强制重建镜像。
- **Q: 如何切换 HTTP/Stdio 模式？**
  - A: Docker 容器启动时最后一个参数决定模式：`docker run ... obsidian-mcp:latest [stdio|http]`。
