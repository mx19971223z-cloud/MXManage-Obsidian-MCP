# 💎 MXManage Obsidian MCP

<p align="center">
  <img src="https://img.shields.io/badge/MCP-Protocol-blue?style=for-the-badge" alt="MCP">
  <img src="https://img.shields.io/badge/Obsidian-Vault-purple?style=for-the-badge" alt="Obsidian">
  <img src="https://img.shields.io/badge/Git-Auto--Sync-orange?style=for-the-badge" alt="Git Sync">
  <img src="https://img.shields.io/badge/Docker-Compatible-blue?style=for-the-badge" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT">
</p>

面向个人与团队知识库的 **Obsidian MCP 服务**。

该项目通过 MCP 协议将 AI 客户端与 Git 托管的 Obsidian 仓库深度集成。AI 每次写入后都会自动执行 Git 同步（commit/push），确保您的全端笔记库实时更新和安全一致。

---

## ✨ 核心特性

- 📂 **全量笔记操作**：读写、创建、删除、重命名，支持语义补丁与 Diff 修改。
- 🔍 **智能语义检索**：内置模糊检索评级与上下文片段返回，让 AI 更懂你的笔记。
- 🏷️ **标签自动化系统**：全库标签聚合、统计、合并与重命名，告别标签混乱。
- 🗓️ **结构化工作流**：自动维护每日日记，结构化记录 AI 交互与工作摘要。
- 🔄 **Git 自动化引擎**：原生支持 GitHub、GitLab、Gitee，写入即备份。
- 🛡️ **双运行模式**：
  - **Stdio 模式**：极速本地调用，适配 Claude Desktop、Cursor 等客户端。
  - **HTTP 模式**：基于 OAuth2 与 PKCE 认证，支持远程连接与多用户场景。

---

## 🛠️ MCP 工具手册

| 类目 | 工具 | 功能描述 |
| :--- | :--- | :--- |
| **文件管理** | `read-note(s)` | 读取单个或多个笔记内容 |
| | `create/edit-note` | 创建或覆盖更新笔记，支持自动建目录 |
| | `append/patch-content` | **[强力]** 追加内容或基于语义锚点进行局部补丁 |
| | `apply-diff-patch` | 应用标准 Unified Diff 补丁，精准修改 |
| | `delete/move-note` | 安全删除或重命名/移动笔记 |
| **目录架构** | `create-directory` | 递归创建目录结构 |
| | `list-files-in-vault` | 全库文件结构扫描（支持类型过滤） |
| | `list-files-in-dir` | 指定目录下文件列表获取 |
| **智能检索** | `search-vault` | 模糊+精确混合检索，带评分与上下文预览 |
| **标签治理** | `add/remove-tags` | 为笔记添加或移除标签 |
| | `rename-tag` | **[全库]** 自动化重命名所有文件中的旧标签 |
| | `manage-tags` | 标签聚合列表、计数统计与逻辑合并 |
| **日记工作流** | `log-journal-entry` | **[推荐]** 自动在每日笔记中追加结构化工作进度 |

---

## 🚀 快速开始

### 1. 快速配置

```bash
# 安装依赖
npm install

# 配置环境变量 (参考 .env.example)
cp .env.example .env
```

### 2. 运行与部署

关于 **Stdio/HTTP/Docker 部署方式**、**开发详细命令**以及 **Git 提供商(GitHub/Gitee)配置**，请参阅：

👉 **[详细部署与运行指南 (DEPLOYMENT.md)](DEPLOYMENT.md)**

---

## 🤝 参与开发

我们欢迎任何形式的贡献！无论是功能建议、Bug 反馈还是代码提交。

- **开源协议**: [MIT License](LICENSE)
---

<p align="right">
  Made with ❤️ for the Obsidian Community
</p>

