import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleBuildNoteContext, handleInspectKnowledgeMap, handleRagSearch } from './rag-handlers';
import type { VaultManager } from '../../services/vault-manager';

class MemoryVault implements VaultManager {
  constructor(private readonly files: Record<string, string>) {}

  async readFile(relativePath: string): Promise<string> {
    const content = this.files[relativePath];
    if (content === undefined) throw new Error(`Missing file: ${relativePath}`);
    return content;
  }

  async writeFile(): Promise<void> {
    throw new Error('Not implemented');
  }

  async deleteFile(): Promise<void> {
    throw new Error('Not implemented');
  }

  async deleteDirectory(): Promise<void> {
    throw new Error('Not implemented');
  }

  async moveFile(): Promise<void> {
    throw new Error('Not implemented');
  }

  async createDirectory(): Promise<void> {
    throw new Error('Not implemented');
  }

  async listFiles(
    relativePath = '',
    options?: { includeDirectories?: boolean; fileTypes?: string[]; recursive?: boolean },
  ): Promise<string[]> {
    const fileTypes = options?.fileTypes;
    return Object.keys(this.files).filter(path => {
      const inPath = relativePath === '' || path.startsWith(`${relativePath}/`);
      const typeMatches =
        !fileTypes || fileTypes.some(type => path.toLowerCase().endsWith(`.${type}`));
      return inPath && typeMatches;
    });
  }

  async fileExists(relativePath: string): Promise<boolean> {
    return this.files[relativePath] !== undefined;
  }

  async isDirectory(relativePath: string): Promise<boolean> {
    return Object.keys(this.files).some(path => path.startsWith(`${relativePath}/`));
  }

  getVaultPath(): string {
    return '/memory-vault';
  }
}

const vault = new MemoryVault({
  'Projects/RAG.md': `---
tags: [rag, obsidian]
aliases: [Knowledge Retrieval]
---
# RAG Knowledge Base

Obsidian can be used as a retrieval augmented generation knowledge base.
Use tags and links to keep source material easy to retrieve.

## Implementation Notes

Chunk notes by headings and include backlink context from [[Projects/Obsidian MCP]].
`,
  'Projects/Obsidian MCP.md': `# Obsidian MCP

The MCP server exposes vault tools to AI clients.
#mcp #obsidian
`,
  'Journal/2026-05-31.md': `# Daily Work

Reviewed RAG search needs for [[Projects/RAG]] and captured follow-up tasks.
`,
});

test('rag search returns heading-aware snippets with citations', async () => {
  const result = await handleRagSearch(vault, {
    query: 'retrieval generation source material',
    limit: 3,
  });

  assert.equal(result.success, true);
  assert.equal(result.data.results[0].path, 'Projects/RAG.md');
  assert.equal(result.data.results[0].title, 'RAG Knowledge Base');
  assert.deepEqual(result.data.results[0].headings, ['RAG Knowledge Base']);
  assert.ok(result.data.results[0].snippet.includes('retrieval augmented generation'));
  assert.equal(result.data.results[0].citation, 'Projects/RAG.md#RAG Knowledge Base');
  assert.ok(result.data.results[0].tags.includes('rag'));
});

test('build note context respects a character budget and preserves sources', async () => {
  const result = await handleBuildNoteContext(vault, {
    query: 'Obsidian RAG',
    paths: ['Projects/RAG.md', 'Journal/2026-05-31.md'],
    max_characters: 420,
  });

  assert.equal(result.success, true);
  assert.ok(result.data.context.length <= 420);
  assert.deepEqual(
    result.data.sources.map((source: { path: string }) => source.path),
    ['Projects/RAG.md', 'Journal/2026-05-31.md'],
  );
  assert.ok(result.data.context.includes('[Projects/RAG.md#RAG Knowledge Base]'));
});

test('inspect knowledge map reports links, backlinks, tags, and orphan notes', async () => {
  const result = await handleInspectKnowledgeMap(vault, {
    query: 'RAG',
  });

  assert.equal(result.success, true);
  assert.ok(result.data.notes.some((note: { path: string }) => note.path === 'Projects/RAG.md'));
  assert.ok(
    result.data.backlinks.some(
      (link: { source: string; target: string }) =>
        link.source === 'Journal/2026-05-31.md' && link.target === 'Projects/RAG.md',
    ),
  );
  assert.ok(result.data.tag_clusters.some((cluster: { tag: string }) => cluster.tag === 'rag'));
  assert.ok(result.data.orphan_notes.includes('Projects/Obsidian MCP.md') === false);
});
