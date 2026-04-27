import { VaultManager } from '@/services/vault-manager';
import type { ToolResponse, JournalConfig } from './types';
import { applyPatch } from 'diff';

type PatchResult = {
  content: string;
  lineRange: { start: number; end: number };
  changedLines: string[];
};

export async function handleReadNote(
  vault: VaultManager,
  args: { path: string },
): Promise<ToolResponse> {
  try {
    const content = await vault.readFile(args.path);

    return {
      success: true,
      data: { content, path: args.path },
      metadata: { timestamp: new Date().toISOString() },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleReadNotes(
  vault: VaultManager,
  args: { paths: string[] },
): Promise<ToolResponse> {
  try {
    const notes = await Promise.all(
      args.paths.map(async path => {
        try {
          const content = await vault.readFile(path);
          return {
            path,
            content,
            success: true,
          };
        } catch (error: any) {
          return {
            path,
            success: false,
            error: error.message,
          };
        }
      }),
    );

    const totalSuccess = notes.filter(n => n.success).length;
    const totalFailed = notes.filter(n => !n.success).length;

    return {
      success: true,
      data: {
        notes,
        total_requested: args.paths.length,
        total_success: totalSuccess,
        total_failed: totalFailed,
      },
      metadata: { timestamp: new Date().toISOString() },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleCreateNote(
  vault: VaultManager,
  args: { path: string; content: string; overwrite?: boolean },
): Promise<ToolResponse> {
  try {
    const exists = await vault.fileExists(args.path);

    if (exists && !args.overwrite) {
      throw new Error(`File ${args.path} already exists. Set overwrite=true to replace it.`);
    }

    await vault.writeFile(args.path, args.content);

    return {
      success: true,
      data: { success: true, path: args.path },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleEditNote(
  vault: VaultManager,
  args: { path: string; content: string },
): Promise<ToolResponse> {
  try {
    await vault.writeFile(args.path, args.content);

    return {
      success: true,
      data: { success: true, path: args.path },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleDeleteNote(
  vault: VaultManager,
  args: { path: string; confirm: boolean },
): Promise<ToolResponse> {
  try {
    if (!args.confirm) {
      throw new Error('Must set confirm=true to delete file');
    }

    await vault.deleteFile(args.path);

    return {
      success: true,
      data: { success: true, path: args.path },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleMoveNote(
  vault: VaultManager,
  args: { source_path: string; destination_path: string; overwrite?: boolean },
): Promise<ToolResponse> {
  try {
    const destExists = await vault.fileExists(args.destination_path);

    if (destExists) {
      if (!args.overwrite) {
        throw new Error(
          `Destination ${args.destination_path} already exists. Set overwrite=true to replace it.`,
        );
      }

      await vault.deleteFile(args.destination_path);
    }

    await vault.moveFile(args.source_path, args.destination_path);

    return {
      success: true,
      data: {
        success: true,
        source_path: args.source_path,
        destination_path: args.destination_path,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.source_path, args.destination_path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleAppendContent(
  vault: VaultManager,
  args: {
    path: string;
    content: string;
    newline?: boolean;
    create_if_missing?: boolean;
  },
  config?: JournalConfig,
): Promise<ToolResponse> {
  try {
    const exists = await vault.fileExists(args.path);
    const newline = args.newline !== false;
    const createIfMissing = args.create_if_missing !== false;

    if (!exists && !createIfMissing) {
      throw new Error(`File ${args.path} does not exist`);
    }

    const currentContent = await getOrInitializeContent(vault, args.path, config);

    let newContent = currentContent;
    if (newline !== false && newContent.length > 0 && !newContent.endsWith('\n')) {
      newContent += '\n';
    }
    newContent += args.content;

    await vault.writeFile(args.path, newContent);

    return {
      success: true,
      data: { success: true, path: args.path },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handlePatchContent(
  vault: VaultManager,
  args: {
    path: string;
    content: string;
    anchor_type: 'heading' | 'block' | 'frontmatter' | 'text_match';
    anchor_value: string;
    position: 'before' | 'after' | 'replace';
    create_if_missing?: boolean;
  },
  config?: JournalConfig,
): Promise<ToolResponse> {
  try {
    const exists = await vault.fileExists(args.path);
    const createIfMissing = args.create_if_missing !== false;

    if (!exists && !createIfMissing) {
      throw new Error(`File ${args.path} does not exist`);
    }

    const currentContent = await getOrInitializeContent(vault, args.path, config);

    let patchResult: PatchResult;

    switch (args.anchor_type) {
      case 'heading':
        patchResult = patchAtHeading(
          currentContent,
          args.anchor_value,
          args.content,
          args.position,
        );
        break;
      case 'text_match':
        patchResult = patchAtTextMatch(
          currentContent,
          args.anchor_value,
          args.content,
          args.position,
        );
        break;
      case 'block':
        patchResult = patchAtBlock(currentContent, args.anchor_value, args.content, args.position);
        break;
      case 'frontmatter':
        patchResult = patchFrontmatter(currentContent, args.anchor_value, args.content);
        break;
      default:
        throw new Error(`Unknown anchor type: ${args.anchor_type}`);
    }

    await vault.writeFile(args.path, patchResult.content);

    // 提取预览所需上下文
    const allLines = patchResult.content.split('\n');
    const contextSize = 2;
    const startLine = patchResult.lineRange.start;
    const endLine = patchResult.lineRange.end;

    const contextBefore = allLines.slice(Math.max(0, startLine - 1 - contextSize), startLine - 1);
    const contextAfter = allLines.slice(endLine, Math.min(allLines.length, endLine + contextSize));

    return {
      success: true,
      data: {
        success: true,
        path: args.path,
        change_preview: {
          line_range: {
            start: startLine,
            end: endLine,
          },
          context_before: contextBefore,
          changed_content: patchResult.changedLines,
          context_after: contextAfter,
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

function patchAtHeading(
  content: string,
  heading: string,
  newContent: string,
  position: 'before' | 'after' | 'replace',
): PatchResult {
  const lines = content.split('\n');
  const headingRegex = new RegExp(`^#+\\s+${escapeRegExp(heading)}\\s*$`, 'i');

  for (let i = 0; i < lines.length; i++) {
    if (headingRegex.test(lines[i])) {
      let processedContent = newContent;

      // 检查新内容首行是否与锚点标题一致
      // 避免用户把标题也写入 content 时导致重复标题
      const contentLines = newContent.split('\n');
      if (contentLines.length > 0 && headingRegex.test(contentLines[0].trim())) {
        // 去掉开头重复标题
        processedContent = contentLines.slice(1).join('\n');
      }

      const insertedLines = processedContent.split('\n');
      let startLine: number;
      let endLine: number;

      if (position === 'before') {
        lines.splice(i, 0, processedContent);
        startLine = i + 1; // 行号从 1 开始
        endLine = i + insertedLines.length;
      } else if (position === 'after') {
        lines.splice(i + 1, 0, processedContent);
        startLine = i + 2; // 行号从 1 开始
        endLine = i + 1 + insertedLines.length;
      } else {
        // replace：移除标题下内容并替换为新内容
        let endIndex = i + 1;
        while (endIndex < lines.length && !/^#+\s+/.test(lines[endIndex])) {
          endIndex++;
        }
        lines.splice(i + 1, endIndex - i - 1, processedContent);
        startLine = i + 2; // 行号从 1 开始（标题下一行）
        endLine = i + 1 + insertedLines.length;
      }

      return {
        content: lines.join('\n'),
        lineRange: { start: startLine, end: endLine },
        changedLines: insertedLines,
      };
    }
  }

  throw new Error(`Heading "${heading}" not found`);
}

function patchAtTextMatch(
  content: string,
  pattern: string,
  newContent: string,
  position: 'before' | 'after' | 'replace',
): PatchResult {
  // 校验 pattern 非空
  if (!pattern || pattern.trim().length === 0) {
    throw new Error('Text pattern cannot be empty');
  }

  const lines = content.split('\n');
  const patternLines = pattern.split('\n');
  const patternLength = patternLines.length;

  // 在文本中查找 pattern 的所有匹配位置
  const matches: Array<{ startLine: number; endLine: number }> = [];

  for (let i = 0; i <= lines.length - patternLength; i++) {
    // 检查当前位置是否命中 pattern
    let isMatch = true;
    for (let j = 0; j < patternLength; j++) {
      if (lines[i + j] !== patternLines[j]) {
        isMatch = false;
        break;
      }
    }

    if (isMatch) {
      matches.push({
        startLine: i + 1, // 行号从 1 开始
        endLine: i + patternLength, // 行号从 1 开始（含结束行）
      });
    }
  }

  // 处理不同匹配场景
  if (matches.length === 0) {
    throw new Error(`Text pattern not found in file`);
  }

  if (matches.length > 1) {
    // 组装带上下文的详细错误信息
    const contextSize = 2;
    let errorMsg = `Text pattern found ${matches.length} times in file:\n`;

    for (const match of matches) {
      const startIdx = match.startLine - 1; // 转为 0 基索引
      const endIdx = match.endLine - 1; // 转为 0 基索引（含结束行）

      // 读取前置上下文
      const beforeStart = Math.max(0, startIdx - contextSize);
      const contextBefore = lines.slice(beforeStart, startIdx);

      // 读取后置上下文
      const afterEnd = Math.min(lines.length, endIdx + 1 + contextSize);
      const contextAfter = lines.slice(endIdx + 1, afterEnd);

      // 拼接上下文展示文本
      errorMsg += `  Lines ${match.startLine}-${match.endLine}:\n`;
      if (contextBefore.length > 0) {
        errorMsg += `    ${contextBefore.join('\n    ')}\n`;
      }
      errorMsg += `    > ${lines.slice(startIdx, endIdx + 1).join('\n    > ')}\n`;
      if (contextAfter.length > 0) {
        errorMsg += `    ${contextAfter.join('\n    ')}\n`;
      }
    }

    errorMsg += 'Please provide more context in anchor_value to uniquely identify the location.';
    throw new Error(errorMsg);
  }

  // 仅命中一次：执行补丁操作
  const match = matches[0];
  const matchStartIdx = match.startLine - 1; // 转为 0 基索引
  const matchEndIdx = match.endLine - 1; // 转为 0 基索引（含结束行）

  const insertedLines = newContent.split('\n');
  let startLine: number;
  let endLine: number;

  if (position === 'before') {
    lines.splice(matchStartIdx, 0, newContent);
    startLine = match.startLine; // 行号从 1 开始
    endLine = match.startLine + insertedLines.length - 1;
  } else if (position === 'after') {
    lines.splice(matchEndIdx + 1, 0, newContent);
    startLine = match.endLine + 1; // 行号从 1 开始
    endLine = match.endLine + insertedLines.length;
  } else {
    // replace：删除命中行并插入新内容
    lines.splice(matchStartIdx, patternLength, newContent);
    startLine = match.startLine; // 行号从 1 开始
    endLine = match.startLine + insertedLines.length - 1;
  }

  return {
    content: lines.join('\n'),
    lineRange: { start: startLine, end: endLine },
    changedLines: insertedLines,
  };
}

function patchAtBlock(
  content: string,
  blockId: string,
  newContent: string,
  position: 'before' | 'after' | 'replace',
): PatchResult {
  const lines = content.split('\n');
  const blockRegex = new RegExp(`\\^${escapeRegExp(blockId)}\\s*$`);

  for (let i = 0; i < lines.length; i++) {
    if (blockRegex.test(lines[i])) {
      const insertedLines = newContent.split('\n');
      let startLine: number;
      let endLine: number;

      if (position === 'before') {
        lines.splice(i, 0, newContent);
        startLine = i + 1; // 行号从 1 开始
        endLine = i + insertedLines.length;
      } else if (position === 'after') {
        lines.splice(i + 1, 0, newContent);
        startLine = i + 2; // 行号从 1 开始
        endLine = i + 1 + insertedLines.length;
      } else {
        lines[i] = newContent;
        startLine = i + 1; // 行号从 1 开始
        endLine = i + insertedLines.length;
      }

      return {
        content: lines.join('\n'),
        lineRange: { start: startLine, end: endLine },
        changedLines: insertedLines,
      };
    }
  }

  throw new Error(`Block ID ^${blockId} not found`);
}

function patchFrontmatter(content: string, key: string, value: string): PatchResult {
  const lines = content.split('\n');
  const newLine = `${key}: ${value}`;
  let startLine: number;
  let endLine: number;

  if (lines[0] === '---') {
    let endIndex = 1;
    while (endIndex < lines.length && lines[endIndex] !== '---') {
      endIndex++;
    }

    const keyRegex = new RegExp(`^${escapeRegExp(key)}:\\s*`);
    for (let i = 1; i < endIndex; i++) {
      if (keyRegex.test(lines[i])) {
        lines[i] = newLine;
        startLine = i + 1; // 行号从 1 开始
        endLine = i + 1;
        return {
          content: lines.join('\n'),
          lineRange: { start: startLine, end: endLine },
          changedLines: [newLine],
        };
      }
    }

    // key 不存在：在结束分隔符前新增
    lines.splice(endIndex, 0, newLine);
    startLine = endIndex + 1; // 行号从 1 开始
    endLine = endIndex + 1;
  } else {
    // 不存在 frontmatter：创建默认头
    lines.unshift('---', newLine, '---', '');
    startLine = 2; // 行号从 1 开始（key 所在行）
    endLine = 2;
  }

  return {
    content: lines.join('\n'),
    lineRange: { start: startLine, end: endLine },
    changedLines: [newLine],
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 读取或初始化文件内容
 * 若文件符合日记路径模板且不存在，则用模板初始化
 */
export async function getOrInitializeContent(
  vault: VaultManager,
  path: string,
  config?: JournalConfig,
): Promise<string> {
  const exists = await vault.fileExists(path);

  if (exists) {
    return await vault.readFile(path);
  }

  if (!config) {
    return '';
  }

  const templatePattern = config.journalPathTemplate.replace('{{date}}', '(\\d{4}-\\d{2}-\\d{2})');
  const regex = new RegExp('^' + templatePattern + '$');
  const match = path.match(regex);

  if (!match) {
    return '';
  }

  const dateStr = match[1];
  const templateContent = await vault.readFile(config.journalFileTemplate);

  return templateContent.replace(/\{\{date\}\}/g, dateStr);
}

export async function handleApplyDiffPatch(
  vault: VaultManager,
  args: {
    path: string;
    diff: string;
  },
): Promise<ToolResponse> {
  try {
    // 校验文件存在
    const exists = await vault.fileExists(args.path);
    if (!exists) {
      throw new Error(`File ${args.path} does not exist`);
    }

    // 校验 diff 格式：至少包含一个 hunk 头
    const hunkHeaderRegex = /^@@ -\d+,?\d* \+\d+,?\d* @@/m;
    if (!hunkHeaderRegex.test(args.diff)) {
      throw new Error(
        'Invalid diff format. The diff must be in unified diff format with at least one hunk header ' +
          '(e.g., "@@ -1,3 +1,3 @@"). Please provide a valid unified diff patch.',
      );
    }

    // 读取当前文件内容
    const currentContent = await vault.readFile(args.path);

    // 以严格匹配模式应用补丁（不启用 fuzz）
    const patchedContent = applyPatch(currentContent, args.diff);

    // 检查补丁是否失败：diff 与当前内容不匹配时 applyPatch 返回 false
    if (patchedContent === false) {
      throw new Error(
        'Failed to apply patch. The diff may not match the current file content. ' +
          'Ensure line numbers and context lines in the diff match the file exactly.',
      );
    }

    // 计算变更区域用于预览
    const changePreview = calculateDiffPreview(patchedContent, args.diff);

    // 写回补丁后的内容
    await vault.writeFile(args.path, patchedContent);

    return {
      success: true,
      data: {
        success: true,
        path: args.path,
        change_preview: changePreview,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

/**
 * 根据 diff 生成变更预览
 * 解析首个 hunk 的行号范围并生成上下文预览
 */
function calculateDiffPreview(
  patchedContent: string,
  diff: string,
):
  | {
      line_range: { start: number; end: number };
      context_before: string[];
      changed_content: string[];
      context_after: string[];
    }
  | undefined {
  // 解析 diff，定位首个 hunk 的行号范围
  const lines = diff.split('\n');
  const hunkHeaderRegex = /^@@ -(\d+),?\d* \+(\d+),?(\d*) @@/;

  for (const line of lines) {
    const match = line.match(hunkHeaderRegex);
    if (match) {
      const newStart = parseInt(match[2], 10);
      const newLines = match[3] ? parseInt(match[3], 10) : 1;

      const allLines = patchedContent.split('\n');
      const contextSize = 2;
      const startLine = newStart;
      const endLine = newStart + newLines - 1;

      const contextBefore = allLines.slice(Math.max(0, startLine - 1 - contextSize), startLine - 1);
      const changedContent = allLines.slice(startLine - 1, endLine);
      const contextAfter = allLines.slice(
        endLine,
        Math.min(allLines.length, endLine + contextSize),
      );

      return {
        line_range: { start: startLine, end: endLine },
        context_before: contextBefore,
        changed_content: changedContent,
        context_after: contextAfter,
      };
    }
  }

  return undefined;
}
