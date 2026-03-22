import { Message, Document, TranscriptEntry } from './agents/types.js';

export class SessionStore {
  currentTask: string | null = null;
  isProcessing = false;
  conversations: Map<string, Message[]> = new Map();
  transcript: TranscriptEntry[] = [];
  documents: Document[] = [];

  reset() {
    this.currentTask = null;
    this.isProcessing = false;
    this.conversations.clear();
    this.transcript = [];
    this.documents = [];
  }

  addToTranscript(entry: TranscriptEntry) {
    this.transcript.push(entry);
  }

  addDocument(doc: Document) {
    this.documents.push(doc);
  }

  getAgentConversation(agentId: string): Message[] {
    if (!this.conversations.has(agentId)) {
      this.conversations.set(agentId, []);
    }
    return this.conversations.get(agentId)!;
  }

  addAgentMessage(agentId: string, role: 'user' | 'assistant', content: string) {
    const conv = this.getAgentConversation(agentId);
    conv.push({ role, content });
  }
}

export const store = new SessionStore();
