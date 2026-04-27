import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { VaultManager } from '@/services/vault-manager';
import * as toolDefs from '@/mcp/tool-definitions';
import * as handlers from '@/mcp/handlers';
import type { ToolResponse } from '@/mcp/handlers';

type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
};

function formatToolResult(result: ToolResponse): McpToolResult {
  const contentText = result.success
    ? JSON.stringify(result.data ?? {}, null, 2)
    : (result.error ?? 'Unknown error');

  const response: McpToolResult = {
    content: [{ type: 'text', text: contentText }],
  };

  if (result.success && result.data !== undefined) {
    response.structuredContent =
      typeof result.data === 'object' && result.data !== null
        ? (result.data as Record<string, unknown>)
        : { value: result.data };
  }

  return response;
}

export function registerTools(server: McpServer, getVaultManager: () => VaultManager): void {
  server.registerTool(
    'read-note',
    {
      title: 'Read Note',
      description: 'Read the contents of a note file',
      inputSchema: toolDefs.ReadNoteSchema.inputSchema,
      outputSchema: toolDefs.ReadNoteSchema.outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true, // 与 Git 托管的 Vault 交互
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleReadNote(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'read-notes',
    {
      title: 'Read Notes',
      description: 'Read multiple notes in a single request for improved efficiency',
      inputSchema: toolDefs.ReadNotesSchema.inputSchema,
      outputSchema: toolDefs.ReadNotesSchema.outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true, // 与 Git 托管的 Vault 交互
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleReadNotes(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'create-note',
    {
      title: 'Create Note',
      description: 'Create a new note with content',
      inputSchema: toolDefs.CreateNoteSchema.inputSchema,
      outputSchema: toolDefs.CreateNoteSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // 追加型操作
        idempotentHint: false, // 文件已存在时会失败（除非开启覆盖）
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleCreateNote(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'edit-note',
    {
      title: 'Edit Note',
      description: 'Replace the entire content of a note',
      inputSchema: toolDefs.EditNoteSchema.inputSchema,
      outputSchema: toolDefs.EditNoteSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // 替换整篇内容
        idempotentHint: true, // 相同内容产生相同结果
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleEditNote(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'delete-note',
    {
      title: 'Delete Note',
      description: 'Delete a note file',
      inputSchema: toolDefs.DeleteNoteSchema.inputSchema,
      outputSchema: toolDefs.DeleteNoteSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // 永久删除文件
        idempotentHint: true, // 重复删除同一文件不会产生额外影响
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleDeleteNote(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'move-note',
    {
      title: 'Move Note',
      description: 'Move or rename a note',
      inputSchema: toolDefs.MoveNoteSchema.inputSchema,
      outputSchema: toolDefs.MoveNoteSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // 会从原位置移除文件
        idempotentHint: true, // 移动到同一路径不会产生额外影响
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleMoveNote(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'append-content',
    {
      title: 'Append Content',
      description: 'Append content to an existing or new file',
      inputSchema: toolDefs.AppendContentSchema.inputSchema,
      outputSchema: toolDefs.AppendContentSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // 追加型操作
        idempotentHint: false, // 每次追加都会新增内容
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const config = {
        journalPathTemplate: process.env.JOURNAL_PATH_TEMPLATE!,
        journalActivitySection: process.env.JOURNAL_ACTIVITY_SECTION!,
        journalFileTemplate: process.env.JOURNAL_FILE_TEMPLATE!,
      };
      const result = await handlers.handleAppendContent(vault, args, config);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'patch-content',
    {
      title: 'Patch Content',
      description:
        'Insert content at a specific location (heading, block, text match, or frontmatter)',
      inputSchema: toolDefs.PatchContentSchema.inputSchema,
      outputSchema: toolDefs.PatchContentSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // 取决于位置（before/after 为追加，replace 为覆盖）
        idempotentHint: false, // 多次 patch 可能累积变化
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const config = {
        journalPathTemplate: process.env.JOURNAL_PATH_TEMPLATE!,
        journalActivitySection: process.env.JOURNAL_ACTIVITY_SECTION!,
        journalFileTemplate: process.env.JOURNAL_FILE_TEMPLATE!,
      };
      const result = await handlers.handlePatchContent(vault, args, config);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'apply-diff-patch',
    {
      title: 'Apply Diff Patch',
      description: 'Apply a unified diff patch to a file',
      inputSchema: toolDefs.ApplyDiffPatchSchema.inputSchema,
      outputSchema: toolDefs.ApplyDiffPatchSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // 修改文件内容
        idempotentHint: false, // 非幂等：重复应用可能失败
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleApplyDiffPatch(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'create-directory',
    {
      title: 'Create Directory',
      description: 'Create a new directory in the vault',
      inputSchema: toolDefs.CreateDirectorySchema.inputSchema,
      outputSchema: toolDefs.CreateDirectorySchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // 追加型操作
        idempotentHint: true, // 目录已存在时不产生额外影响
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleCreateDirectory(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'list-files-in-vault',
    {
      title: 'List Files in Vault',
      description: 'List all files in the vault root',
      inputSchema: toolDefs.ListFilesInVaultSchema.inputSchema,
      outputSchema: toolDefs.ListFilesInVaultSchema.outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleListFilesInVault(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'list-files-in-dir',
    {
      title: 'List Files in Directory',
      description: 'List files in a specific directory',
      inputSchema: toolDefs.ListFilesInDirSchema.inputSchema,
      outputSchema: toolDefs.ListFilesInDirSchema.outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleListFilesInDir(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'search-vault',
    {
      title: 'Search Vault',
      description:
        'Fuzzy or exact search across vault filenames and content with relevance scoring',
      inputSchema: toolDefs.SearchVaultSchema.inputSchema,
      outputSchema: toolDefs.SearchVaultSchema.outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleSearchVault(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'add-tags',
    {
      title: 'Add Tags',
      description: 'Add tags to a note (frontmatter or inline)',
      inputSchema: toolDefs.AddTagsSchema.inputSchema,
      outputSchema: toolDefs.AddTagsSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // 追加型操作
        idempotentHint: true, // 重复添加相同标签不会产生额外影响
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleAddTags(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'remove-tags',
    {
      title: 'Remove Tags',
      description: 'Remove tags from a note',
      inputSchema: toolDefs.RemoveTagsSchema.inputSchema,
      outputSchema: toolDefs.RemoveTagsSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // 删除元数据
        idempotentHint: true, // 删除不存在标签不会产生额外影响
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleRemoveTags(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'rename-tag',
    {
      title: 'Rename Tag',
      description: 'Rename a tag across all notes in the vault',
      inputSchema: toolDefs.RenameTagSchema.inputSchema,
      outputSchema: toolDefs.RenameTagSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // 跨文件替换标签
        idempotentHint: true, // 重命名为同名不会产生额外影响
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleRenameTag(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'manage-tags',
    {
      title: 'Manage Tags',
      description: 'List, count, or merge tags across the vault',
      inputSchema: toolDefs.ManageTagsSchema.inputSchema,
      outputSchema: toolDefs.ManageTagsSchema.outputSchema,
      annotations: {
        readOnlyHint: false, // 支持 merge，属于写操作
        destructiveHint: false, // 取决于 action（list/count 只读，merge 写入）
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleManageTags(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'log-journal-entry',
    {
      title: 'Log Journal Entry',
      description: "Automatically log work to today's journal entry",
      inputSchema: toolDefs.LogJournalEntrySchema.inputSchema,
      outputSchema: toolDefs.LogJournalEntrySchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // 向日记追加内容
        idempotentHint: false, // 每次记录都会生成带时间戳的新条目
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const config = {
        journalPathTemplate: process.env.JOURNAL_PATH_TEMPLATE!,
        journalActivitySection: process.env.JOURNAL_ACTIVITY_SECTION!,
        journalFileTemplate: process.env.JOURNAL_FILE_TEMPLATE!,
      };
      const result = await handlers.handleLogJournalEntry(vault, args, config);
      return formatToolResult(result);
    },
  );
}
