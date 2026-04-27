import Fuse from 'fuse.js';
import { VaultManager } from '@/services/vault-manager';
import type { ToolResponse } from './types';
import { logger } from '@/utils/logger';

interface SearchResult {
  path: string;
  match_type: 'filename' | 'content';
  relevance_score: 1 | 2 | 3 | 4;
  matches?: Array<{
    line: number;
    content: string;
    context_before: string[];
    context_after: string[];
  }>;
}

interface FileSearchItem {
  path: string;
  filename: string;
  content?: string;
  lines?: string[];
}

export async function handleSearchVault(
  vault: VaultManager,
  args: {
    query: string;
    exact?: boolean;
    path_filter?: string;
    file_types?: string[];
    limit?: number;
  },
): Promise<ToolResponse> {
  try {
    const isExact = args.exact || false;
    const limit = args.limit || 50;
    const fileTypes = args.file_types || ['md'];

    // 列出全部文件
    const allFiles = await vault.listFiles('', {
      fileTypes,
      recursive: true,
    });

    // 如提供路径过滤条件，则先筛选文件
    let filesToSearch = allFiles;
    if (args.path_filter) {
      const pathRegex = new RegExp(args.path_filter, 'i');
      filesToSearch = allFiles.filter(f => pathRegex.test(f));
    }

    const results = isExact
      ? await performExactSearch(vault, filesToSearch, args.query, limit)
      : await performFuzzySearch(vault, filesToSearch, args.query, limit);

    return {
      success: true,
      data: {
        results,
        total_matches: results.length,
        total_files: results.length,
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

async function performFuzzySearch(
  vault: VaultManager,
  files: string[],
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // 先检索文件名（无需读取文件内容）
  const filenameItems: FileSearchItem[] = files.map(path => ({
    path,
    filename: path.split('/').pop() || path,
  }));

  const filenameFuse = new Fuse(filenameItems, {
    keys: ['filename'],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
  });

  const filenameMatches = filenameFuse.search(query);

  // 添加文件名命中结果并进行质量过滤
  for (const match of filenameMatches) {
    if (results.length >= limit) break;

    const score = match.score || 0;

    // 过滤低质量匹配（score > 0.6）
    if (score > 0.6) continue;

    results.push({
      path: match.item.path,
      match_type: 'filename',
      relevance_score: fuseScoreToRelevance(score),
    });
  }

  // 再检索文件内容
  const contentItems: FileSearchItem[] = [];

  // 分批读取文件内容
  const batchSize = 10;
  for (let i = 0; i < files.length && results.length < limit; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async path => {
        try {
          const content = await vault.readFile(path);
          const lines = content.split('\n');
          contentItems.push({
            path,
            filename: path.split('/').pop() || path,
            content,
            lines,
          });
        } catch (error) {
          logger.warn(`Error reading file during search`, { path, error });
        }
      }),
    );
  }

  // 对内容执行模糊检索
  const contentFuse = new Fuse(contentItems, {
    keys: ['content'],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
  });

  const contentMatches = contentFuse.search(query);

  // 处理内容命中结果
  for (const match of contentMatches) {
    if (results.length >= limit) break;

    const item = match.item;
    const score = match.score || 0;

    // 提取匹配行
    const matchingLines = findMatchingLines(item.lines || [], query, false);

    if (matchingLines.length > 0) {
      results.push({
        path: item.path,
        match_type: 'content',
        relevance_score: fuseScoreToRelevance(score),
        matches: matchingLines,
      });
    }
  }

  return results;
}

async function performExactSearch(
  vault: VaultManager,
  files: string[],
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();

  // 先检索文件名
  for (const path of files) {
    if (results.length >= limit) break;

    const filename = path.split('/').pop() || path;
    if (filename.toLowerCase().includes(queryLower)) {
      results.push({
        path,
        match_type: 'filename',
        relevance_score: 1, // 文件名命中固定为 1
      });
    }
  }

  // 再检索文件内容
  const batchSize = 10;
  for (let i = 0; i < files.length && results.length < limit; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async path => {
        try {
          const content = await vault.readFile(path);
          const lines = content.split('\n');

          const matchingLines = findMatchingLines(lines, query, true);

          if (matchingLines.length > 0) {
            return {
              path,
              match_type: 'content' as const,
              relevance_score: calculateExactScore(query, matchingLines),
              matches: matchingLines,
            };
          }

          return null;
        } catch (error) {
          logger.warn(`Error searching file`, { path, error });
          return null;
        }
      }),
    );

    for (const result of batchResults) {
      if (result && results.length < limit) {
        results.push(result);
      }
    }
  }

  return results;
}

function findMatchingLines(
  lines: string[],
  query: string,
  isExact: boolean,
): Array<{
  line: number;
  content: string;
  context_before: string[];
  context_after: string[];
}> {
  const matches: Array<{
    line: number;
    content: string;
    context_before: string[];
    context_after: string[];
  }> = [];

  const queryLower = query.toLowerCase();
  // 模糊匹配时，将查询拆分为多个词元
  const queryTokens = isExact ? [] : queryLower.split(/\s+/).filter(t => t.length > 0);

  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();

    let isMatch = false;
    if (isExact) {
      // 精确匹配：子串命中
      isMatch = lineLower.includes(queryLower);
    } else {
      // 模糊匹配：每个 query 词元都要能模糊匹配该行中的某个词（顺序不限）
      isMatch = fuzzyMatchLine(lineLower, queryTokens);
    }

    if (isMatch) {
      const contextBefore: string[] = [];
      const contextAfter: string[] = [];

      // 提取命中行前 2 行上下文
      for (let j = Math.max(0, i - 2); j < i; j++) {
        contextBefore.push(lines[j]);
      }

      // 提取命中行后 2 行上下文
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 2); j++) {
        contextAfter.push(lines[j]);
      }

      matches.push({
        line: i + 1, // 行号从 1 开始
        content: lines[i],
        context_before: contextBefore,
        context_after: contextAfter,
      });
    }
  }

  return matches;
}

function fuzzyMatchLine(line: string, queryTokens: string[]): boolean {
  // 从行文本中提取词（字母数字序列）
  const lineWords = line.match(/\w+/g) || [];

  // 检查每个 query 词元是否至少命中该行中的一个词
  return queryTokens.every(queryToken => {
    // 使用 Fuse.js 对当前词元与行内词列表做模糊匹配
    const fuse = new Fuse(lineWords, {
      threshold: 0.4, // 与文件级匹配阈值一致
      ignoreLocation: true,
    });

    const results = fuse.search(queryToken);
    return results.length > 0;
  });
}

function fuseScoreToRelevance(score: number): 1 | 2 | 3 | 4 {
  if (score < 0.25) return 1; // 优
  if (score < 0.5) return 2; // 良
  if (score < 0.75) return 3; // 中
  return 4; // 差
}

function calculateExactScore(
  query: string,
  matches: Array<{ line: number; content: string }>,
): 1 | 2 | 3 | 4 {
  const queryLower = query.toLowerCase();

  // 优先判断：是否有行以 query 开头
  for (const match of matches) {
    const contentLower = match.content.toLowerCase().trim();
    if (contentLower.startsWith(queryLower)) {
      return 1; // 优：行首命中
    }
  }

  // 判断是否存在完整词命中
  const wordBoundaryRegex = new RegExp(`\\b${escapeRegExp(queryLower)}\\b`, 'i');
  for (const match of matches) {
    if (wordBoundaryRegex.test(match.content)) {
      return 1; // 优：完整词命中
    }
  }

  // 判断 query 是否在行内较前位置出现
  for (const match of matches) {
    const contentLower = match.content.toLowerCase();
    const index = contentLower.indexOf(queryLower);
    if (index !== -1 && index < 10) {
      return 2; // 良：较前位置命中
    }
  }

  // 其他精确命中默认归为“良”
  return 2;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
