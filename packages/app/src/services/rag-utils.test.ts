import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractNoteMetadata, splitMarkdownIntoChunks } from './rag-utils';

const markdown = `---
tags: [rag, obsidian]
aliases:
  - Personal Knowledge Base
---
# Personal RAG

Top level overview for retrieval.

## Capture

Collect source notes with links to [[Inbox/Article]] and #workflow.

### Review

Summarize notes before indexing.
`;

test('extractNoteMetadata reads title, frontmatter tags, inline tags, aliases, and wikilinks', () => {
  const metadata = extractNoteMetadata('Systems/RAG.md', markdown);

  assert.equal(metadata.title, 'Personal RAG');
  assert.deepEqual(metadata.tags, ['rag', 'obsidian', 'workflow']);
  assert.deepEqual(metadata.aliases, ['Personal Knowledge Base']);
  assert.deepEqual(metadata.wikilinks, ['Inbox/Article']);
});

test('splitMarkdownIntoChunks preserves heading hierarchy and line ranges', () => {
  const chunks = splitMarkdownIntoChunks('Systems/RAG.md', markdown, 220);

  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[1].headings, ['Personal RAG', 'Capture']);
  assert.equal(chunks[1].start_line, 10);
  assert.ok(chunks[1].content.includes('Collect source notes'));
  assert.equal(chunks[1].citation, 'Systems/RAG.md#Personal RAG > Capture');
});
