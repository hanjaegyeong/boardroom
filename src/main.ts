import Phaser from 'phaser';
import { gameConfig } from './config';
import { OfficeScene } from './game/scenes/OfficeScene';
import { EventStream } from './services/EventStream';
import { GameBridge } from './services/GameBridge';
import { Sidebar } from './ui/Sidebar';

class NanoOfficeApp {
  private game: Phaser.Game;
  private eventStream: EventStream;
  private gameBridge: GameBridge;
  private sidebar: Sidebar;

  private meetingControls: HTMLElement;
  private btnContinue: HTMLButtonElement;
  private btnFinalize: HTMLButtonElement;
  private btnStop: HTMLButtonElement;
  private buttonRow: HTMLElement;
  private downloadConfirm: HTMLElement;
  private btnDownloadYes: HTMLButtonElement;
  private btnDownloadNo: HTMLButtonElement;

  constructor() {
    this.game = new Phaser.Game(gameConfig);
    this.eventStream = new EventStream();
    this.eventStream.connect();
    this.gameBridge = new GameBridge(this.eventStream);
    this.sidebar = new Sidebar();

    // Meeting control buttons
    this.meetingControls = document.getElementById('meeting-controls')!;
    this.btnContinue = document.getElementById('btn-continue') as HTMLButtonElement;
    this.btnFinalize = document.getElementById('btn-finalize') as HTMLButtonElement;
    this.btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
    this.buttonRow = document.getElementById('button-row')!;
    this.downloadConfirm = document.getElementById('download-confirm')!;
    this.btnDownloadYes = document.getElementById('btn-download-yes') as HTMLButtonElement;
    this.btnDownloadNo = document.getElementById('btn-download-no') as HTMLButtonElement;

    this.game.events.on('ready', () => this.waitForScene());

    this.setupBridge();
    this.setupTaskSubmission();
    this.setupMeetingControls();
    this.setupDownloadConfirm();
    this.setupResize();
  }

  private waitForScene() {
    const check = () => {
      const scene = this.game.scene.getScene('OfficeScene') as OfficeScene;
      if (scene && scene.agentManager) {
        this.gameBridge.setScene(scene);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  }

  private setupBridge() {
    this.gameBridge.setChatHandler((agentId, name, title, token, isStart) => {
      if (isStart) {
        this.sidebar.startAgentMessage(agentId, name, title);
      } else {
        this.sidebar.appendToken(agentId, token);
      }
    });

    this.gameBridge.setSpeakEndHandler((agentId) => {
      this.sidebar.endAgentMessage(agentId);
    });

    this.gameBridge.setPhaseHandler((phase, label) => {
      this.sidebar.setPhase(phase, label);

      if (phase === 'waiting') {
        // Round complete - show continue/finalize buttons
        this.showMeetingControls(true);
        this.setControlsEnabled(true);
      } else if (phase === 'stopped') {
        // Stopped mid-meeting - show finalize option + start button
        this.showMeetingControls(true);
        this.btnContinue.disabled = true;
        this.btnFinalize.disabled = false;
        this.btnStop.disabled = true;
        this.sidebar.setProcessing(false);
        this.buttonRow.style.display = '';
      } else if (phase === 'complete') {
        // Meeting fully done - hide controls, show start button
        this.showMeetingControls(false);
        this.sidebar.setProcessing(false);
        this.buttonRow.style.display = '';
      } else {
        // In progress - show stop button only
        this.showMeetingControls(true);
        this.setControlsEnabled(false);
        this.btnStop.disabled = false;
      }
    });

    this.gameBridge.setDocumentHandler((docId, agentId, agentTitle, title) => {
      this.sidebar.addDocumentCard(docId, agentId, agentTitle, title);
    });

    this.gameBridge.setTaskCompleteHandler((summary) => {
      this.sidebar.addSystemMessage(summary);
    });

    this.gameBridge.setUsageHandler((inputTokens, outputTokens, totalCalls, costUsd) => {
      this.sidebar.updateUsage(inputTokens, outputTokens, totalCalls, costUsd);
    });

    this.gameBridge.setAgentsSelectedHandler((agents) => {
      this.sidebar.showSelectedAgents(agents);
    });

    this.gameBridge.setConfirmDownloadHandler((reportPath) => {
      this.sidebar.addSystemMessage(`보고서 저장 완료: ${reportPath}`);
      this.downloadConfirm.classList.remove('hidden');
      this.showMeetingControls(false);
    });

    this.gameBridge.setProjectCompleteHandler((projectPath) => {
      this.sidebar.addSystemMessage(`프로젝트 생성 완료: ${projectPath}`);
      this.downloadConfirm.classList.add('hidden');
    });

    this.gameBridge.setErrorHandler((message) => {
      this.sidebar.addSystemMessage(`Error: ${message}`);
      this.showMeetingControls(false);
      this.sidebar.setProcessing(false);
    });
  }

  private setupTaskSubmission() {
    this.sidebar.setSubmitHandler(async (task, departments) => {
      this.sidebar.clearChat();
      this.buttonRow.style.display = 'none';

      try {
        const res = await fetch('/api/task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task, departments }),
        });

        if (!res.ok) {
          const data = await res.json();
          this.sidebar.addSystemMessage(`Error: ${data.error || 'Failed'}`);
          this.sidebar.setProcessing(false);
          this.buttonRow.style.display = '';
        }
      } catch (err) {
        this.sidebar.addSystemMessage('서버 연결에 실패했습니다.');
        this.sidebar.setProcessing(false);
        this.buttonRow.style.display = '';
      }
    });

    this.sidebar.setCeoMessageHandler(async (message) => {
      try {
        await fetch('/api/ceo-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
      } catch {
        this.sidebar.addSystemMessage('메시지 전송 실패');
      }
    });
  }

  private setupMeetingControls() {
    this.btnContinue.addEventListener('click', async () => {
      this.setControlsEnabled(false);
      this.btnStop.disabled = false;
      try {
        await fetch('/api/continue', { method: 'POST' });
      } catch (err) {
        this.sidebar.addSystemMessage('요청 실패');
        this.setControlsEnabled(true);
      }
    });

    this.btnFinalize.addEventListener('click', async () => {
      this.setControlsEnabled(false);
      this.btnStop.disabled = false;
      try {
        await fetch('/api/finalize', { method: 'POST' });
      } catch (err) {
        this.sidebar.addSystemMessage('요청 실패');
        this.setControlsEnabled(true);
      }
    });

    this.btnStop.addEventListener('click', async () => {
      try {
        await fetch('/api/stop', { method: 'POST' });
      } catch (err) {
        this.sidebar.addSystemMessage('중단 요청 실패');
      }
      // Phase handler will manage UI state via 'stopped' event
    });
  }

  private setupDownloadConfirm() {
    this.btnDownloadYes.addEventListener('click', async () => {
      this.btnDownloadYes.disabled = true;
      this.btnDownloadNo.disabled = true;
      this.sidebar.addSystemMessage('프로젝트 코드 생성 중...');
      try {
        await fetch('/api/generate-project', { method: 'POST' });
      } catch (err) {
        this.sidebar.addSystemMessage('프로젝트 생성 요청 실패');
      }
    });

    this.btnDownloadNo.addEventListener('click', () => {
      this.downloadConfirm.classList.add('hidden');
      this.sidebar.addSystemMessage('보고서만 저장되었습니다.');
      this.sidebar.setProcessing(false);
      this.buttonRow.style.display = '';
    });
  }

  private showMeetingControls(show: boolean) {
    this.meetingControls.classList.toggle('hidden', !show);
  }

  private setControlsEnabled(enabled: boolean) {
    this.btnContinue.disabled = !enabled;
    this.btnFinalize.disabled = !enabled;
    this.btnStop.disabled = !enabled;
  }

  private setupResize() {
    const handle = document.getElementById('resize-handle')!;
    const sidebar = document.getElementById('sidebar')!;
    let isDragging = false;

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const newWidth = window.innerWidth - e.clientX - 6; // 6 = handle width
      const clamped = Math.max(280, Math.min(700, newWidth));
      sidebar.style.width = clamped + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }
}

new NanoOfficeApp();
