import fs from 'fs';
import path from 'path';
import { Message, Document, TranscriptEntry } from './agents/types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

export interface PersistedSession {
  id: string;
  task: string;
  transcript: TranscriptEntry[];
  documents: Document[];
  timestamp: number;
}

export class SessionStore {
  currentTask: string | null = null;
  isProcessing = false;
  conversations: Map<string, Message[]> = new Map();
  transcript: TranscriptEntry[] = [];
  documents: Document[] = [];
  private history: PersistedSession[] = [];

  constructor() {
    this.loadHistory();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadHistory() {
    this.ensureDataDir();
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
        this.history = JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to load session history:', e);
      this.history = [];
    }
  }

  saveSession() {
    if (!this.currentTask || this.transcript.length === 0) return;
    this.ensureDataDir();
    const session: PersistedSession = {
      id: Date.now().toString(36),
      task: this.currentTask,
      transcript: [...this.transcript],
      documents: [...this.documents],
      timestamp: Date.now(),
    };
    this.history.push(session);
    if (this.history.length > 50) {
      this.history = this.history.slice(-50);
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(this.history, null, 2), 'utf-8');
  }

  getHistory(): PersistedSession[] {
    return this.history;
  }

  getSessionById(id: string): PersistedSession | undefined {
    return this.history.find(s => s.id === id);
  }

  getRecentContext(maxSessions: number = 3): string {
    const recent = this.history.slice(-maxSessions);
    if (recent.length === 0) return '';
    return recent.map(s => {
      const entries = s.transcript.slice(0, 5).map(t =>
        `[${t.agentTitle} ${t.agentName}]: ${t.content.slice(0, 100)}...`
      ).join('\n');
      return `이전 회의 (${new Date(s.timestamp).toLocaleDateString('ko-KR')}): ${s.task}\n${entries}`;
    }).join('\n\n');
  }

  reset() {
    this.saveSession();
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
