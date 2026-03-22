import { marked } from 'marked';

interface AgentColors {
  [key: string]: { name: string; title: string; color: string; department: string };
}

const AGENT_INFO: AgentColors = {
  mkt_lead:    { name: 'Jiyeon',  title: '마케팅팀 팀장',  color: '#ec4899', department: '마케팅' },
  mkt_content: { name: 'Seoha',   title: '콘텐츠 전략가', color: '#f59e0b', department: '마케팅' },
  mkt_growth:  { name: 'Minjun',  title: '그로스 해커',   color: '#8b5cf6', department: '마케팅' },
  dev_lead:    { name: 'Hyunwoo', title: '개발팀 팀장',    color: '#3b82f6', department: '개발' },
  dev_backend: { name: 'Eunji',   title: '백엔드 개발자', color: '#10b981', department: '개발' },
  dev_frontend:{ name: 'Taehyun', title: '프론트 개발자', color: '#06b6d4', department: '개발' },
  dev_ai:      { name: 'Siwon',   title: 'AI 담당',      color: '#f43f5e', department: '개발' },
};

export class Sidebar {
  private chatMessages: HTMLElement;
  private phaseIndicator: HTMLElement;
  private documentsList: HTMLElement;
  private taskInput: HTMLTextAreaElement;
  private taskSubmit: HTMLButtonElement;
  private topicBanner: HTMLElement;
  private usageBar: HTMLElement;
  private usageTokens: HTMLElement;
  private usageCalls: HTMLElement;
  private usageCost: HTMLElement;
  private currentMessageEl: HTMLElement | null = null;
  private currentMessageText = '';
  private onSubmitTask: ((task: string) => void) | null = null;

  constructor() {
    this.chatMessages = document.getElementById('chat-messages')!;
    this.phaseIndicator = document.getElementById('phase-indicator')!;
    this.documentsList = document.getElementById('documents-list')!;
    this.taskInput = document.getElementById('task-input') as HTMLTextAreaElement;
    this.taskSubmit = document.getElementById('task-submit') as HTMLButtonElement;
    this.topicBanner = document.getElementById('topic-banner')!;
    this.usageBar = document.getElementById('usage-bar')!;
    this.usageTokens = document.getElementById('usage-tokens')!;
    this.usageCalls = document.getElementById('usage-calls')!;
    this.usageCost = document.getElementById('usage-cost')!;

    this.taskSubmit.addEventListener('click', () => this.submitTask());
    this.taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submitTask();
      }
    });
  }

  setSubmitHandler(handler: (task: string) => void) {
    this.onSubmitTask = handler;
  }

  private submitTask() {
    const task = this.taskInput.value.trim();
    if (!task) return;

    this.taskInput.value = '';
    this.setProcessing(true);
    this.topicBanner.textContent = task;
    this.topicBanner.classList.remove('hidden');

    if (this.onSubmitTask) {
      this.onSubmitTask(task);
    }
  }

  setProcessing(processing: boolean) {
    this.taskInput.disabled = processing;
    this.taskSubmit.disabled = processing;
    this.taskSubmit.textContent = processing ? '회의 진행 중...' : '회의 시작';
  }

  setPhase(phase: string, label: string) {
    this.phaseIndicator.textContent = label;
    this.phaseIndicator.className = phase === 'complete' ? '' : 'active';

    // Add phase divider to chat
    if (phase !== 'gathering') {
      const divider = document.createElement('div');
      divider.className = 'phase-divider';
      divider.textContent = `--- ${label} ---`;
      this.chatMessages.appendChild(divider);
      this.scrollToBottom();
    }
  }

  startAgentMessage(agentId: string, name: string, title: string) {
    const info = AGENT_INFO[agentId] || { name, title, color: '#888' };

    const msgEl = document.createElement('div');
    msgEl.className = `chat-message speaking`;
    msgEl.style.borderLeftColor = info.color;
    msgEl.id = `msg-${agentId}-${Date.now()}`;

    msgEl.innerHTML = `
      <div class="agent-name agent-${agentId}">
        <span class="role-badge badge-${agentId}">${info.title}</span>
        ${info.name}
      </div>
      <div class="message-text"></div>
    `;

    this.chatMessages.appendChild(msgEl);
    this.currentMessageEl = msgEl;
    this.currentMessageText = '';
    this.scrollToBottom();
  }

  appendToken(agentId: string, token: string) {
    if (!this.currentMessageEl) return;

    this.currentMessageText += token;
    const textEl = this.currentMessageEl.querySelector('.message-text');
    if (textEl) {
      textEl.textContent = this.currentMessageText;
    }
    this.scrollToBottom();
  }

  endAgentMessage(agentId: string) {
    if (this.currentMessageEl) {
      this.currentMessageEl.classList.remove('speaking');
      this.currentMessageEl = null;
      this.currentMessageText = '';
    }
  }

  addDocumentCard(docId: string, agentId: string, agentTitle: string, title: string) {
    const info = AGENT_INFO[agentId];
    const card = document.createElement('div');
    card.className = 'doc-card';
    card.dataset.docId = docId;

    card.innerHTML = `
      <div class="doc-icon" style="color: ${info?.color || '#888'}">&#128196;</div>
      <div class="doc-info">
        <div class="doc-title">${agentTitle} 보고서</div>
        <div class="doc-agent">${info?.name || agentId}</div>
      </div>
    `;

    card.addEventListener('click', () => this.openDocument(docId, title));
    this.documentsList.appendChild(card);
  }

  private async openDocument(docId: string, title: string) {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      const doc = await res.json();

      const modal = document.getElementById('document-modal')!;
      const modalTitle = document.getElementById('modal-title')!;
      const modalBody = document.getElementById('modal-body')!;

      modalTitle.textContent = doc.title;
      modalBody.innerHTML = await marked(doc.content);
      modal.classList.remove('hidden');

      // Download button
      const downloadBtn = document.getElementById('modal-download')!;
      downloadBtn.onclick = () => {
        const blob = new Blob([doc.content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${doc.agentTitle}_${doc.agentName}_report.md`;
        a.click();
        URL.revokeObjectURL(url);
      };

      // Close button
      document.getElementById('modal-close')!.onclick = () => {
        modal.classList.add('hidden');
      };

      // Click outside to close
      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      };
    } catch (err) {
      console.error('Failed to load document:', err);
    }
  }

  updateUsage(inputTokens: number, outputTokens: number, totalCalls: number, costUsd: number) {
    this.usageBar.classList.remove('hidden');
    const total = inputTokens + outputTokens;
    this.usageTokens.textContent = `${total.toLocaleString()} tokens (in: ${inputTokens.toLocaleString()} / out: ${outputTokens.toLocaleString()})`;
    this.usageCalls.textContent = `${totalCalls} calls`;
    this.usageCost.textContent = `$${costUsd.toFixed(3)}`;
  }

  showSelectedAgents(agents: string[]) {
    const names = agents.map(id => {
      const info = AGENT_INFO[id];
      return info ? `<span class="role-badge badge-${id}" style="margin: 0 2px;">${info.title}</span>${info.name}` : id;
    }).join(' ');

    const el = document.createElement('div');
    el.className = 'selected-agents-banner';
    el.innerHTML = `참여: ${names}`;
    this.chatMessages.appendChild(el);
    this.scrollToBottom();
  }

  addSystemMessage(text: string) {
    const msgEl = document.createElement('div');
    msgEl.className = 'phase-divider';
    msgEl.textContent = text;
    this.chatMessages.appendChild(msgEl);
    this.scrollToBottom();
  }

  clearChat() {
    this.chatMessages.innerHTML = '';
    this.documentsList.innerHTML = '';
    this.usageBar.classList.add('hidden');
  }

  private scrollToBottom() {
    const chatLog = document.getElementById('chat-log')!;
    chatLog.scrollTop = chatLog.scrollHeight;
  }
}
