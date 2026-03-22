export interface AgentPersona {
  id: string;
  title: string;
  name: string;
  color: string;
  systemPrompt: string;
  expertise: string[];
  documentType: string;
  department: 'marketing' | 'development';
  role: 'lead' | 'member';
}

export interface Department {
  id: string;
  name: string;
  agents: string[];
  lead: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Document {
  id: string;
  agentId: string;
  agentTitle: string;
  agentName: string;
  title: string;
  content: string;
  timestamp: number;
}

export interface TranscriptEntry {
  agentId: string;
  agentName: string;
  agentTitle: string;
  content: string;
  phase: string;
  timestamp: number;
}

export type SSEEvent =
  | { type: 'task_accepted'; taskId: string; summary: string }
  | { type: 'phase_change'; phase: string; label: string }
  | { type: 'agents_selected'; agents: string[] }
  | { type: 'department_activated'; department: string; agents: string[] }
  | { type: 'agent_moving'; agentId: string; destination: 'meeting' | 'desk' }
  | { type: 'agent_speak_start'; agentId: string; name: string; title: string }
  | { type: 'agent_speak_token'; agentId: string; token: string }
  | { type: 'agent_speak_end'; agentId: string; fullText: string }
  | { type: 'document_ready'; docId: string; agentId: string; agentTitle: string; title: string }
  | { type: 'task_complete'; summary: string }
  | { type: 'confirm_download'; reportPath: string }
  | { type: 'project_generating'; message: string }
  | { type: 'project_complete'; projectPath: string }
  | { type: 'usage_update'; inputTokens: number; outputTokens: number; totalCalls: number; costUsd: number }
  | { type: 'error'; message: string };
