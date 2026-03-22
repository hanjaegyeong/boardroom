import Phaser from 'phaser';
import { AgentSprite } from './Agent';
import { AGENT_ZONES, AGENT_LOCAL_WAYPOINTS, COMMON_WAYPOINTS, HALLWAY_X, getMeetingPositions, Position } from '../map/zones';
import { CHARACTERS } from '../assets/characterPixels';

export class AgentManager {
  private scene: Phaser.Scene;
  public agents: Map<string, AgentSprite> = new Map();
  private wanderFlags: Map<string, boolean> = new Map();
  private wanderTimers: Map<string, Phaser.Time.TimerEvent> = new Map();
  private inMeeting: Set<string> = new Set();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.createAgents();
  }

  private createAgents() {
    for (const char of CHARACTERS) {
      const zone = AGENT_ZONES[char.id];
      const agent = new AgentSprite(this.scene, char.id, zone.chair.x, zone.chair.y);
      this.agents.set(char.id, agent);
    }
  }

  getAgent(id: string): AgentSprite | undefined {
    return this.agents.get(id);
  }

  // --- Wandering system ---

  startWandering(agentIds?: string[]) {
    const ids = agentIds || Array.from(this.agents.keys()).filter(id => id !== 'accountant');
    for (const id of ids) {
      if (this.inMeeting.has(id)) continue; // Don't wander if in meeting
      this.wanderFlags.set(id, true);
      this.scheduleWander(id);
    }
  }

  stopWandering(agentIds?: string[]) {
    const ids = agentIds || Array.from(this.agents.keys());
    for (const id of ids) {
      this.wanderFlags.set(id, false);
      const timer = this.wanderTimers.get(id);
      if (timer) {
        timer.destroy();
        this.wanderTimers.delete(id);
      }
      const agent = this.agents.get(id);
      if (agent) agent.stopMovement();
    }
  }

  private scheduleWander(agentId: string) {
    if (!this.wanderFlags.get(agentId)) return;

    const delay = 2000 + Math.random() * 5000; // 2-7 seconds
    const timer = this.scene.time.delayedCall(delay, () => {
      this.wanderTimers.delete(agentId);
      this.doWander(agentId);
    });
    this.wanderTimers.set(agentId, timer);
  }

  private async doWander(agentId: string) {
    if (!this.wanderFlags.get(agentId)) return;

    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Pick target: 70% local, 30% common area
    const local = AGENT_LOCAL_WAYPOINTS[agentId] || [];
    const useCommon = Math.random() < 0.3;
    const pool = useCommon ? COMMON_WAYPOINTS : local;
    if (pool.length === 0) return;

    const target = pool[Math.floor(Math.random() * pool.length)];
    const from = agent.getPosition();
    const path = this.buildPath(from, target);

    try {
      await agent.moveAlongPath(path);
    } catch {
      // Movement interrupted
    }

    // Schedule next wander if still allowed
    if (this.wanderFlags.get(agentId)) {
      this.scheduleWander(agentId);
    }
  }

  // --- Meeting movement ---

  // Pre-calculated positions for up to 6 agents in a circle
  private meetingPositions = getMeetingPositions(6);

  // Add a single agent to an ongoing meeting
  async addAgentToMeeting(agentId: string): Promise<void> {
    if (this.inMeeting.has(agentId)) return;

    this.stopWandering([agentId]);
    const slotIndex = this.inMeeting.size; // next available slot
    this.inMeeting.add(agentId);

    const agent = this.agents.get(agentId);
    if (!agent) return;

    const pos = this.meetingPositions[slotIndex % this.meetingPositions.length];
    const path = this.buildPath(agent.getPosition(), pos);
    await agent.moveAlongPath(path);
  }

  // Move a single agent to their desk
  async moveAgentToDesk(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const zone = AGENT_ZONES[agentId];
    if (!zone) return;

    const path = this.buildPath(agent.getPosition(), zone.chair);
    await agent.moveAlongPath(path);
  }

  // Batch move (kept for compatibility)
  async moveToMeeting(agentIds: string[]): Promise<void> {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < agentIds.length; i++) {
      const delay = i * 300;
      const promise = new Promise<void>(resolve => {
        this.scene.time.delayedCall(delay, async () => {
          await this.addAgentToMeeting(agentIds[i]);
          resolve();
        });
      });
      promises.push(promise);
    }
    await Promise.all(promises);
  }

  async moveToDesks(agentIds?: string[]): Promise<void> {
    const ids = agentIds || Array.from(this.inMeeting);
    const promises: Promise<void>[] = [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const agent = this.agents.get(id);
      if (!agent) continue;

      const zone = AGENT_ZONES[id];
      const from = agent.getPosition();
      const path = this.buildPath(from, zone.chair);

      const delay = i * 200;
      const promise = new Promise<void>(resolve => {
        this.scene.time.delayedCall(delay, async () => {
          await agent.moveAlongPath(path);
          resolve();
        });
      });
      promises.push(promise);
    }

    await Promise.all(promises);
  }

  disperseFromMeeting() {
    const meetingIds = Array.from(this.inMeeting);
    this.inMeeting.clear();
    this.startWandering(meetingIds);
  }

  // --- State management ---

  setSpeaking(agentId: string) {
    for (const [id, agent] of this.agents) {
      agent.setSpeaking(id === agentId);
    }
  }

  stopAllSpeaking() {
    for (const agent of this.agents.values()) {
      agent.setSpeaking(false);
    }
  }

  setTyping(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent) agent.setTyping(true);
  }

  stopTyping(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent) agent.setTyping(false);
  }

  // --- Pathfinding ---

  private buildPath(from: Position, to: Position): Position[] {
    // Very close: go direct
    const dist = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
    if (dist <= 3) {
      return [to];
    }

    // Both on right side (x >= 13): move freely (no internal walls)
    if (from.x >= 13 && to.x >= 13) {
      return [to];
    }

    const path: Position[] = [];

    // From right side: go to corridor first
    if (from.x >= 13) {
      path.push({ x: 13, y: from.y });
      path.push({ x: HALLWAY_X, y: from.y });
    } else if (from.x !== HALLWAY_X) {
      // From office: step into hallway
      path.push({ x: HALLWAY_X, y: from.y });
    }

    // Move vertically in hallway (crosses floor dividers through doorways at x=7)
    if (from.y !== to.y) {
      path.push({ x: HALLWAY_X, y: to.y });
    }

    // From hallway to right side
    if (to.x >= 13) {
      path.push({ x: 13, y: to.y });
    }

    path.push(to);
    return path;
  }
}
