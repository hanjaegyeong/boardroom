// Office zone definitions - all positions in tile coordinates
// Map is 32x24 tiles

export interface Position {
  x: number;
  y: number;
}

export interface AgentZone {
  desk: Position;
  chair: Position;     // Where agent sits
}

// Agent desk and seat positions
export const AGENT_ZONES: Record<string, AgentZone> = {
  ceo: {
    desk: { x: 3, y: 3 },
    chair: { x: 3, y: 4 },
  },
  cto: {
    desk: { x: 3, y: 9 },
    chair: { x: 3, y: 10 },
  },
  cmo: {
    desk: { x: 9, y: 9 },
    chair: { x: 9, y: 10 },
  },
  cfo: {
    desk: { x: 3, y: 15 },
    chair: { x: 3, y: 16 },
  },
  cso: {
    desk: { x: 9, y: 15 },
    chair: { x: 9, y: 16 },
  },
  cdo: {
    desk: { x: 9, y: 3 },
    chair: { x: 9, y: 4 },
  },
  accountant: {
    desk: { x: 28, y: 21 },
    chair: { x: 28, y: 22 },
  },
};

// Meeting center in the lounge area
export const MEETING_CENTER: Position = { x: 20, y: 12 };

// Generate meeting positions arranged in a circle around center
export function getMeetingPositions(count: number): Position[] {
  if (count === 1) return [MEETING_CENTER];
  const positions: Position[] = [];
  const radius = count <= 3 ? 1.5 : 2;
  const angleStep = (2 * Math.PI) / count;
  for (let i = 0; i < count; i++) {
    const angle = angleStep * i - Math.PI / 2;
    positions.push({
      x: Math.round(MEETING_CENTER.x + radius * Math.cos(angle)),
      y: Math.round(MEETING_CENTER.y + radius * Math.sin(angle)),
    });
  }
  return positions;
}

// Local waypoints per agent (near their office)
export const AGENT_LOCAL_WAYPOINTS: Record<string, Position[]> = {
  ceo: [{ x: 3, y: 4 }, { x: 5, y: 4 }, { x: 3, y: 5 }, { x: 7, y: 4 }],
  cto: [{ x: 3, y: 10 }, { x: 5, y: 10 }, { x: 3, y: 11 }, { x: 7, y: 10 }],
  cmo: [{ x: 9, y: 10 }, { x: 11, y: 10 }, { x: 9, y: 11 }, { x: 7, y: 10 }],
  cfo: [{ x: 3, y: 16 }, { x: 5, y: 16 }, { x: 3, y: 17 }, { x: 7, y: 16 }],
  cso: [{ x: 9, y: 16 }, { x: 11, y: 16 }, { x: 9, y: 17 }, { x: 7, y: 16 }],
  cdo: [{ x: 9, y: 4 }, { x: 11, y: 4 }, { x: 9, y: 5 }, { x: 7, y: 4 }],
  accountant: [{ x: 28, y: 22 }, { x: 27, y: 22 }, { x: 29, y: 22 }],
};

// Common area waypoints (lounge / open area on right side)
export const COMMON_WAYPOINTS: Position[] = [
  { x: 17, y: 3 }, { x: 20, y: 3 }, { x: 23, y: 3 },
  { x: 17, y: 6 }, { x: 20, y: 6 }, { x: 23, y: 6 },
  { x: 17, y: 9 }, { x: 20, y: 9 }, { x: 23, y: 9 },
  { x: 17, y: 14 }, { x: 20, y: 14 }, { x: 23, y: 14 },
  { x: 17, y: 18 }, { x: 20, y: 18 }, { x: 23, y: 18 },
];

// Hallway X coordinate (all doorways are at x=6-7)
export const HALLWAY_X = 7;

// Hallway waypoints for pathfinding
export const HALLWAY_POINTS: Position[] = [
  { x: 7, y: 4 },
  { x: 7, y: 10 },
  { x: 7, y: 16 },
  { x: 13, y: 4 },
  { x: 13, y: 10 },
  { x: 13, y: 16 },
];

// Map dimensions
export const MAP_WIDTH = 32;
export const MAP_HEIGHT = 24;
