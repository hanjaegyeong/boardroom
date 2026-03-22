import { EventStream } from './EventStream';
import { OfficeScene } from '../game/scenes/OfficeScene';

export class GameBridge {
  private eventStream: EventStream;
  private scene: OfficeScene | null = null;
  private selectedAgents: string[] = [];
  private onChatMessage: ((agentId: string, name: string, title: string, token: string, isStart: boolean) => void) | null = null;
  private onPhaseChange: ((phase: string, label: string) => void) | null = null;
  private onDocumentReady: ((docId: string, agentId: string, agentTitle: string, title: string) => void) | null = null;
  private onTaskComplete: ((summary: string) => void) | null = null;
  private onError: ((message: string) => void) | null = null;
  private onSpeakEnd: ((agentId: string, fullText: string) => void) | null = null;
  private onUsageUpdate: ((inputTokens: number, outputTokens: number, totalCalls: number, costUsd: number) => void) | null = null;
  private onAgentsSelected: ((agents: string[]) => void) | null = null;

  constructor(eventStream: EventStream) {
    this.eventStream = eventStream;
    this.setupListeners();
  }

  setScene(scene: OfficeScene) {
    this.scene = scene;
    // Start wandering when scene is set
    scene.agentManager.startWandering();
  }

  setChatHandler(handler: typeof this.onChatMessage) { this.onChatMessage = handler; }
  setPhaseHandler(handler: typeof this.onPhaseChange) { this.onPhaseChange = handler; }
  setDocumentHandler(handler: typeof this.onDocumentReady) { this.onDocumentReady = handler; }
  setTaskCompleteHandler(handler: typeof this.onTaskComplete) { this.onTaskComplete = handler; }
  setErrorHandler(handler: typeof this.onError) { this.onError = handler; }
  setSpeakEndHandler(handler: typeof this.onSpeakEnd) { this.onSpeakEnd = handler; }
  setUsageHandler(handler: typeof this.onUsageUpdate) { this.onUsageUpdate = handler; }
  setAgentsSelectedHandler(handler: typeof this.onAgentsSelected) { this.onAgentsSelected = handler; }

  private setupListeners() {
    this.eventStream.on('agents_selected', (data: any) => {
      this.selectedAgents = data.agents || [];
      if (this.onAgentsSelected) {
        this.onAgentsSelected(this.selectedAgents);
      }
    });

    this.eventStream.on('agent_moving', (data: any) => {
      if (!this.scene) return;

      if (data.destination === 'meeting') {
        // Individual agent joins meeting dynamically
        this.scene.agentManager.addAgentToMeeting(data.agentId);
      } else if (data.destination === 'desk') {
        this.scene.agentManager.moveAgentToDesk(data.agentId);
      }
    });

    this.eventStream.on('agent_speak_start', (data: any) => {
      if (this.scene) {
        this.scene.agentManager.setSpeaking(data.agentId);
      }
      if (this.onChatMessage) {
        this.onChatMessage(data.agentId, data.name, data.title, '', true);
      }
    });

    const agentTexts: Record<string, string> = {};

    this.eventStream.on('agent_speak_token', (data: any) => {
      if (this.onChatMessage) {
        this.onChatMessage(data.agentId, '', '', data.token, false);
      }
      if (this.scene) {
        if (!agentTexts[data.agentId]) agentTexts[data.agentId] = '';
        agentTexts[data.agentId] += data.token;
        const full = agentTexts[data.agentId];
        const display = full.length > 50 ? '...' + full.substring(full.length - 47) : full;
        this.scene.showSpeechBubble(data.agentId, display);
      }
    });

    this.eventStream.on('agent_speak_end', (data: any) => {
      agentTexts[data.agentId] = '';
      if (this.scene) {
        this.scene.agentManager.stopAllSpeaking();
        const shortText = data.fullText.substring(0, 60) + (data.fullText.length > 60 ? '...' : '');
        this.scene.showSpeechBubble(data.agentId, shortText);
      }
      if (this.onSpeakEnd) {
        this.onSpeakEnd(data.agentId, data.fullText);
      }
    });

    this.eventStream.on('phase_change', (data: any) => {
      if (this.onPhaseChange) {
        this.onPhaseChange(data.phase, data.label);
      }
    });

    this.eventStream.on('document_ready', (data: any) => {
      if (this.scene) {
        this.scene.agentManager.setTyping(data.agentId);
        setTimeout(() => {
          this.scene?.agentManager.stopTyping(data.agentId);
        }, 1000);
      }
      if (this.onDocumentReady) {
        this.onDocumentReady(data.docId, data.agentId, data.agentTitle, data.title);
      }
    });

    this.eventStream.on('task_complete', (data: any) => {
      if (this.scene) {
        this.scene.agentManager.stopAllSpeaking();
        this.scene.hideAllBubbles();
        // Resume wandering for meeting participants
        this.scene.agentManager.disperseFromMeeting();
      }
      if (this.onTaskComplete) {
        this.onTaskComplete(data.summary);
      }
      // Keep cost bubble visible for 10s after task complete, then hide
      if (this.scene) {
        const scene = this.scene;
        setTimeout(() => scene.hideCostBubble(), 10000);
      }
    });

    this.eventStream.on('usage_update', (data: any) => {
      if (this.onUsageUpdate) {
        this.onUsageUpdate(data.inputTokens, data.outputTokens, data.totalCalls, data.costUsd);
      }
      if (this.scene) {
        this.scene.showCostBubble(data.inputTokens, data.outputTokens, data.totalCalls, data.costUsd);
      }
    });

    this.eventStream.on('error', (data: any) => {
      if (this.onError) {
        this.onError(data.message);
      }
    });
  }
}
