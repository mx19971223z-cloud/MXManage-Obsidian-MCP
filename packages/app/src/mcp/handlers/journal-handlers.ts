import { VaultManager } from '@/services/vault-manager';
import { formatJournalEntry } from '@/services/journal-formatter';
import type { ToolResponse, JournalConfig } from './types';
import { getOrInitializeContent } from './file-handlers';

export async function handleLogJournalEntry(
  vault: VaultManager,
  args: {
    activity_type:
      | 'development'
      | 'research'
      | 'writing'
      | 'planning'
      | 'learning'
      | 'problem-solving';
    summary: string;
    key_topics: string[];
    outputs?: string[];
    project?: string;
  },
  config: JournalConfig,
): Promise<ToolResponse> {
  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const journalPath = config.journalPathTemplate.replace('{{date}}', dateStr);

    let content = await getOrInitializeContent(vault, journalPath, config);

    const entry = formatJournalEntry({
      timestamp: now,
      activityType: args.activity_type,
      summary: args.summary,
      keyTopics: args.key_topics,
      outputs: args.outputs,
      project: args.project,
    });

    content = insertUnderSection(content, config.journalActivitySection, entry);

    await vault.writeFile(journalPath, content);

    return {
      success: true,
      data: {
        success: true,
        journal_path: journalPath,
        entry_timestamp: now.toISOString(),
      },
      metadata: {
        timestamp: now.toISOString(),
        affected_files: [journalPath],
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

function insertUnderSection(content: string, sectionHeading: string, entry: string): string {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === sectionHeading) {
      const sectionLevel = sectionHeading.match(/^#+/)?.[0].length || 2;
      let insertIndex = i + 1;

      while (insertIndex < lines.length) {
        const line = lines[insertIndex].trim();
        const headingMatch = line.match(/^(#+)\s/);
        if (headingMatch && headingMatch[1].length <= sectionLevel) {
          break;
        }
        insertIndex++;
      }

      lines.splice(insertIndex, 0, entry);
      return lines.join('\n');
    }
  }

  return content + '\n\n' + sectionHeading + '\n' + entry;
}
