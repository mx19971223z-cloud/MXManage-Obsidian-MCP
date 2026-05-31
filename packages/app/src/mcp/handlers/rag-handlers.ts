import type { VaultManager } from '../../services/vault-manager';
import {
  buildSnippet,
  extractNoteMetadata,
  noteIdentity,
  resolveObsidianLink,
  scoreChunk,
  splitMarkdownIntoChunks,
  type NoteChunk,
} from '../../services/rag-utils';
import type { ToolResponse } from './types';

interface RagSearchArgs {
  query: string;
  path_filter?: string;
  tags?: string[];
  limit?: number;
  max_snippet_characters?: number;
}

interface BuildNoteContextArgs {
  query?: string;
  paths?: string[];
  path_filter?: string;
  tags?: string[];
  max_characters?: number;
}

interface InspectKnowledgeMapArgs {
  query?: string;
  path_filter?: string;
  tags?: string[];
  include_orphans?: boolean;
  limit?: number;
}

export async function handleRagSearch(
  vault: VaultManager,
  args: RagSearchArgs,
): Promise<ToolResponse> {
  try {
    const chunks = await loadFilteredChunks(vault, args);
    const limit = args.limit ?? 10;
    const maxSnippetCharacters = args.max_snippet_characters ?? 700;

    const results = chunks
      .map(chunk => ({ chunk, score: scoreChunk(args.query, chunk) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ chunk, score }) => ({
        path: chunk.path,
        title: chunk.title,
        headings: chunk.headings,
        start_line: chunk.start_line,
        end_line: chunk.end_line,
        score,
        tags: chunk.tags,
        links: chunk.links,
        snippet: buildSnippet(chunk.content, args.query, maxSnippetCharacters),
        citation: chunk.citation,
      }));

    return ok({
      query: args.query,
      results,
      total_results: results.length,
      total_chunks_searched: chunks.length,
    });
  } catch (error: any) {
    return fail(error);
  }
}

export async function handleBuildNoteContext(
  vault: VaultManager,
  args: BuildNoteContextArgs,
): Promise<ToolResponse> {
  try {
    const maxCharacters = args.max_characters ?? 6000;
    const query = args.query ?? '';
    const chunks = await loadFilteredChunks(vault, args);
    const selectedChunks = args.paths
      ? prioritizeFirstChunkPerPath(chunks)
      : query
        ? chunks
            .map(chunk => ({ chunk, score: scoreChunk(query, chunk) }))
            .sort((a, b) => b.score - a.score)
            .map(item => item.chunk)
        : chunks;

    let context = '';
    const sourceMap = new Map<string, { path: string; title: string; citations: string[] }>();

    for (const chunk of selectedChunks) {
      const section = `[${chunk.citation}]\n${buildSnippet(chunk.content, query, 1200)}\n\n`;
      if (context.length + section.length > maxCharacters) {
        const remaining = maxCharacters - context.length;
        if (remaining > 80) context += section.slice(0, remaining).trimEnd();
        break;
      }

      context += section;
      const source = sourceMap.get(chunk.path) ?? {
        path: chunk.path,
        title: chunk.title,
        citations: [],
      };
      source.citations.push(chunk.citation);
      sourceMap.set(chunk.path, source);
    }

    return ok({
      context: context.trimEnd(),
      character_count: context.trimEnd().length,
      max_characters: maxCharacters,
      sources: Array.from(sourceMap.values()),
    });
  } catch (error: any) {
    return fail(error);
  }
}

export async function handleInspectKnowledgeMap(
  vault: VaultManager,
  args: InspectKnowledgeMapArgs,
): Promise<ToolResponse> {
  try {
    const files = await vault.listFiles('', { fileTypes: ['md'], recursive: true });
    const filteredFiles = applyPathFilter(files, args.path_filter);
    const noteRecords = await Promise.all(
      filteredFiles.map(async path => {
        const content = await vault.readFile(path);
        return {
          metadata: extractNoteMetadata(path, content),
          score: args.query ? scoreChunk(args.query, splitMarkdownIntoChunks(path, content)[0]) : 1,
        };
      }),
    );

    const selected = noteRecords
      .filter(record => record.score > 0 && matchesTags(record.metadata.tags, args.tags))
      .slice(0, args.limit ?? 50);
    const selectedIdentities = new Set(selected.map(record => noteIdentity(record.metadata.path)));
    const links: Array<{ source: string; target: string; unresolved: boolean }> = [];
    const backlinks: Array<{ source: string; target: string }> = [];
    const tagMap = new Map<string, Set<string>>();

    for (const record of noteRecords) {
      for (const tag of record.metadata.tags) {
        if (!tagMap.has(tag)) tagMap.set(tag, new Set());
        tagMap.get(tag)!.add(record.metadata.path);
      }

      for (const link of [...record.metadata.wikilinks, ...record.metadata.markdownLinks]) {
        const target = resolveObsidianLink(link, files);
        if (
          selectedIdentities.has(noteIdentity(record.metadata.path)) ||
          selectedIdentities.has(noteIdentity(target ?? link))
        ) {
          links.push({
            source: record.metadata.path,
            target: target ?? link,
            unresolved: target === undefined,
          });
        }
        if (target && selectedIdentities.has(noteIdentity(target))) {
          backlinks.push({ source: record.metadata.path, target });
        }
      }
    }

    const connected = new Set<string>();
    for (const link of links) {
      connected.add(link.source);
      if (!link.unresolved) connected.add(link.target);
    }

    return ok({
      notes: selected.map(record => ({
        path: record.metadata.path,
        title: record.metadata.title,
        tags: record.metadata.tags,
        aliases: record.metadata.aliases,
        outgoing_links: record.metadata.wikilinks,
      })),
      links,
      backlinks,
      tag_clusters: Array.from(tagMap.entries())
        .map(([tag, notePaths]) => ({ tag, count: notePaths.size, notes: Array.from(notePaths) }))
        .sort((a, b) => b.count - a.count),
      orphan_notes:
        args.include_orphans === false
          ? []
          : selected.map(record => record.metadata.path).filter(path => !connected.has(path)),
    });
  } catch (error: any) {
    return fail(error);
  }
}

async function loadFilteredChunks(
  vault: VaultManager,
  args: {
    paths?: string[];
    path_filter?: string;
    tags?: string[];
  },
): Promise<NoteChunk[]> {
  const files = args.paths ?? (await vault.listFiles('', { fileTypes: ['md'], recursive: true }));
  const filteredFiles = applyPathFilter(files, args.path_filter);
  const chunks: NoteChunk[] = [];

  for (const path of filteredFiles) {
    const content = await vault.readFile(path);
    const noteChunks = splitMarkdownIntoChunks(path, content);
    chunks.push(...noteChunks.filter(chunk => matchesTags(chunk.tags, args.tags)));
  }

  return chunks;
}

function applyPathFilter(files: string[], pathFilter?: string): string[] {
  if (!pathFilter) return files;
  const regex = new RegExp(pathFilter, 'i');
  return files.filter(path => regex.test(path));
}

function matchesTags(noteTags: string[], requiredTags?: string[]): boolean {
  if (!requiredTags || requiredTags.length === 0) return true;
  const normalized = new Set(noteTags.map(tag => tag.toLowerCase()));
  return requiredTags.every(tag => normalized.has(tag.toLowerCase()));
}

function prioritizeFirstChunkPerPath(chunks: NoteChunk[]): NoteChunk[] {
  const seen = new Set<string>();
  const firstChunks: NoteChunk[] = [];
  const remainingChunks: NoteChunk[] = [];

  for (const chunk of chunks) {
    if (seen.has(chunk.path)) {
      remainingChunks.push(chunk);
    } else {
      firstChunks.push(chunk);
      seen.add(chunk.path);
    }
  }

  return [...firstChunks, ...remainingChunks];
}

function ok(data: Record<string, unknown>): ToolResponse {
  return {
    success: true,
    data,
    metadata: { timestamp: new Date().toISOString() },
  };
}

function fail(error: any): ToolResponse {
  return {
    success: false,
    error: error.message,
    metadata: { timestamp: new Date().toISOString() },
  };
}
