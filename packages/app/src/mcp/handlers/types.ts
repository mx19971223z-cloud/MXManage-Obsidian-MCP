export interface ToolResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata: {
    timestamp: string;
    affected_files?: string[];
    affected_items?: string[];
  };
}

export interface JournalConfig {
  journalPathTemplate: string;
  journalActivitySection: string;
  journalFileTemplate: string;
}
