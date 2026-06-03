export interface NoteMetadata {
  path: string;
  title: string;
  tags: string[];
  aliases: string[];
  wikilinks: string[];
  markdownLinks: string[];
}

export interface NoteChunk {
  path: string;
  title: string;
  headings: string[];
  content: string;
  start_line: number;
  end_line: number;
  tags: string[];
  links: string[];
  citation: string;
}

interface HeadingState {
  level: number;
  text: string;
}

export function extractNoteMetadata(path: string, content: string): NoteMetadata {
  const body = stripFrontmatter(content);
  const firstHeading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = firstHeading || filenameToTitle(path);
  const frontmatter = readFrontmatter(content);
  const tags = unique([...extractFrontmatterTags(frontmatter), ...extractInlineTags(body)]);
  const aliases = extractFrontmatterList(frontmatter, 'aliases');
  const wikilinks = unique(
    Array.from(body.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)).map(match => match[1].trim()),
  );
  const markdownLinks = unique(
    Array.from(body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g))
      .map(match => match[1].trim())
      .filter(link => !/^[a-z]+:/i.test(link)),
  );

  return {
    path,
    title,
    tags,
    aliases,
    wikilinks,
    markdownLinks,
  };
}

export function splitMarkdownIntoChunks(
  path: string,
  content: string,
  maxCharacters = 1800,
): NoteChunk[] {
  const metadata = extractNoteMetadata(path, content);
  const bodyInfo = getBodyWithStartLine(content);
  const lines = bodyInfo.body.split('\n');
  const chunks: NoteChunk[] = [];
  const headingStack: HeadingState[] = [];
  let currentStart = bodyInfo.startLine;
  let currentHeadingStack: HeadingState[] = [];
  let currentLines: string[] = [];

  const flush = (endLine: number): void => {
    const chunkContent = trimChunkContent(currentLines.join('\n'));
    if (!chunkContent) return;

    const headings = currentHeadingStack.map(heading => heading.text);
    for (const part of splitLongContent(chunkContent, maxCharacters)) {
      chunks.push({
        path,
        title: metadata.title,
        headings: headings.length > 0 ? headings : [metadata.title],
        content: part,
        start_line: currentStart,
        end_line: endLine,
        tags: metadata.tags,
        links: unique([...metadata.wikilinks, ...metadata.markdownLinks]),
        citation: buildCitation(path, headings.length > 0 ? headings : [metadata.title]),
      });
    }
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);

    if (headingMatch) {
      flush(index);

      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
      currentHeadingStack = [...headingStack];
      currentStart = bodyInfo.startLine + index;
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  flush(bodyInfo.startLine + lines.length - 1);

  if (chunks.length === 0 && content.trim()) {
    chunks.push({
      path,
      title: metadata.title,
      headings: [metadata.title],
      content: truncateAtBoundary(bodyInfo.body.trim(), maxCharacters),
      start_line: bodyInfo.startLine,
      end_line: bodyInfo.startLine + lines.length - 1,
      tags: metadata.tags,
      links: unique([...metadata.wikilinks, ...metadata.markdownLinks]),
      citation: buildCitation(path, [metadata.title]),
    });
  }

  return chunks;
}

export function scoreChunk(query: string, chunk: NoteChunk): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;

  const haystacks = [
    { text: chunk.path, weight: 3 },
    { text: chunk.title, weight: 4 },
    { text: chunk.headings.join(' '), weight: 4 },
    { text: chunk.tags.join(' '), weight: 3 },
    { text: chunk.content, weight: 1 },
  ];

  let score = 0;
  for (const token of tokens) {
    for (const haystack of haystacks) {
      const lower = haystack.text.toLowerCase();
      if (lower.includes(token)) {
        score += haystack.weight;
      }
    }
  }

  return score;
}

export function buildSnippet(content: string, query: string, maxCharacters: number): string {
  const normalized = content.trim();
  if (normalized.length <= maxCharacters) return normalized;

  const tokens = tokenize(query);
  const lower = normalized.toLowerCase();
  const firstMatch = tokens
    .map(token => lower.indexOf(token))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstMatch === undefined) return truncateAtBoundary(normalized, maxCharacters);

  const start = Math.max(0, firstMatch - Math.floor(maxCharacters / 3));
  const end = Math.min(normalized.length, start + maxCharacters);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalized.length ? '...' : '';

  return `${prefix}${normalized.slice(start, end).trim()}${suffix}`;
}

export function resolveObsidianLink(link: string, files: string[]): string | undefined {
  const normalized = normalizeNotePath(link);
  return files.find(file => normalizeNotePath(file) === normalized);
}

export function noteIdentity(path: string): string {
  return normalizeNotePath(path);
}

function readFrontmatter(content: string): string {
  if (!content.startsWith('---\n')) return '';
  const end = content.indexOf('\n---', 4);
  if (end === -1) return '';
  return content.slice(4, end).trim();
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---\n')) return content;
  const end = content.indexOf('\n---', 4);
  if (end === -1) return content;
  return content.slice(end + 4).replace(/^\r?\n/, '');
}

function getBodyWithStartLine(content: string): { body: string; startLine: number } {
  if (!content.startsWith('---\n')) return { body: content, startLine: 1 };
  const end = content.indexOf('\n---', 4);
  if (end === -1) return { body: content, startLine: 1 };
  const bodyStartIndex = end + 4;
  const body = content.slice(bodyStartIndex).replace(/^\r?\n/, '');
  const frontmatterLineCount = content.slice(0, bodyStartIndex).split('\n').length;
  return { body, startLine: frontmatterLineCount + 1 };
}

function extractFrontmatterTags(frontmatter: string): string[] {
  return extractFrontmatterList(frontmatter, 'tags').flatMap(tag => normalizeTag(tag));
}

function extractFrontmatterList(frontmatter: string, key: string): string[] {
  if (!frontmatter) return [];

  const lines = frontmatter.split('\n');
  const values: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const inlineMatch = line.match(new RegExp(`^${key}:\\s*(.*)$`));
    if (inlineMatch) {
      const value = inlineMatch[1].trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        values.push(...value.slice(1, -1).split(','));
      } else if (value.length > 0) {
        values.push(value);
      }

      for (let nested = index + 1; nested < lines.length; nested++) {
        const nestedMatch = lines[nested].match(/^\s*-\s+(.+)$/);
        if (!nestedMatch) break;
        values.push(nestedMatch[1]);
      }
    }
  }

  return values.map(cleanYamlValue).filter(value => value.length > 0);
}

function extractInlineTags(content: string): string[] {
  return Array.from(content.matchAll(/(^|\s)#([\p{L}\p{N}_/-]+)/gu)).flatMap(match =>
    normalizeTag(match[2]),
  );
}

function normalizeTag(tag: string): string[] {
  const cleaned = cleanYamlValue(tag).replace(/^#/, '');
  return cleaned ? [cleaned] : [];
}

function cleanYamlValue(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '');
}

function filenameToTitle(path: string): string {
  const filename = path.split('/').pop() || path;
  return filename.replace(/\.[^.]+$/, '');
}

function trimChunkContent(content: string): string {
  return content.replace(/^\s+|\s+$/g, '');
}

function splitLongContent(content: string, maxCharacters: number): string[] {
  if (content.length <= maxCharacters) return [content];

  const parts: string[] = [];
  let remaining = content;
  while (remaining.length > maxCharacters) {
    const part = truncateAtBoundary(remaining, maxCharacters);
    parts.push(part);
    remaining = remaining.slice(part.length).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

function truncateAtBoundary(content: string, maxCharacters: number): string {
  if (content.length <= maxCharacters) return content;
  const slice = content.slice(0, maxCharacters);
  const boundary = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
  if (boundary < Math.floor(maxCharacters * 0.6)) return slice.trim();
  return slice.slice(0, boundary).trim();
}

function buildCitation(path: string, headings: string[]): string {
  return `${path}#${headings.join(' > ')}`;
}

function tokenize(query: string): string[] {
  return unique(query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || []);
}

function normalizeNotePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\.md$/i, '').toLowerCase();
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
