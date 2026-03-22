// Office zone definitions - all positions in tile coordinates
// Map is 32x24 tiles

export interface Position {
  x: number;
  y: number;
}

export interface AgentZone {
  desk: Position;
  chair: Position;
}

export interface DepartmentZone {
  area: { x1: number; y1: number; x2: number; y2: number };
  meetingSpot: Position;
}

// Department zones
export const DEPARTMENT_ZONES: Record<string, DepartmentZone> = {
  marketing: {
    area: { x1: 1, y1: 1, x2: 13, y2: 10 },
    meetingSpot: { x: 8, y: 7 },
  },
  development: {
    area: { x1: 1, y1: 13, x2: 13, y2: 22 },
    meetingSpot: { x: 8, y: 19 },
  },
};

// Agent desk and seat positions
export const AGENT_ZONES: Record<string, AgentZone> = {
  // Marketing department (top-left)
  mkt_lead:    { desk: { x: 3, y: 3 },  chair: { x: 3, y: 4 } },
  mkt_content: { desk: { x: 7, y: 3 },  chair: { x: 7, y: 4 } },
  mkt_growth:  { desk: { x: 11, y: 3 }, chair: { x: 11, y: 4 } },
  // Development department (bottom-left)
  dev_lead:     { desk: { x: 3, y: 15 },  chair: { x: 3, y: 16 } },
  dev_backend:  { desk: { x: 7, y: 15 },  chair: { x: 7, y: 16 } },
  dev_ai:       { desk: { x: 11, y: 15 }, chair: { x: 11, y: 16 } },
  // Cost center (bottom-right)
  accountant:   { desk: { x: 28, y: 21 }, chair: { x: 28, y: 22 } },
};

// Shared meeting center (right side lounge)
export const MEETING_CENTER: Position = { x: 22, y: 12 };

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

// Department-level meeting positions (within department area)
export function getDepartmentMeetingPositions(department: string, count: number): Position[] {
  const zone = DEPARTMENT_ZONES[department];
  if (!zone) return getMeetingPositions(count);
  const center = zone.meetingSpot;
  if (count === 1) return [center];
  const positions: Position[] = [];
  const radius = 1.5;
  const angleStep = (2 * Math.PI) / count;
  for (let i = 0; i < count; i++) {
    const angle = angleStep * i - Math.PI / 2;
    positions.push({
      x: Math.round(center.x + radius * Math.cos(angle)),
      y: Math.round(center.y + radius * Math.sin(angle)),
    });
  }
  return positions;
}

// Local waypoints per agent (near their department area)
export const AGENT_LOCAL_WAYPOINTS: Record<string, Position[]> = {
  mkt_lead:    [{ x: 3, y: 4 }, { x: 5, y: 5 }, { x: 3, y: 6 }, { x: 7, y: 5 }],
  mkt_content: [{ x: 7, y: 4 }, { x: 9, y: 5 }, { x: 7, y: 6 }, { x: 5, y: 5 }],
  mkt_growth:  [{ x: 11, y: 4 }, { x: 13, y: 5 }, { x: 11, y: 6 }, { x: 9, y: 5 }],
  dev_lead:     [{ x: 3, y: 16 }, { x: 5, y: 17 }, { x: 3, y: 18 }, { x: 7, y: 17 }],
  dev_backend:  [{ x: 7, y: 16 }, { x: 9, y: 17 }, { x: 7, y: 18 }, { x: 5, y: 17 }],
  dev_ai:       [{ x: 11, y: 16 }, { x: 13, y: 17 }, { x: 11, y: 18 }, { x: 9, y: 17 }],
  accountant:   [{ x: 28, y: 22 }, { x: 27, y: 22 }, { x: 29, y: 22 }],
};

// Common area waypoints (lounge / open area on right side + department common areas)
export const COMMON_WAYPOINTS: Position[] = [
  // Marketing common area
  { x: 5, y: 8 }, { x: 8, y: 8 }, { x: 11, y: 8 },
  // Development common area
  { x: 5, y: 20 }, { x: 8, y: 20 }, { x: 11, y: 20 },
  // Shared meeting/lounge area (right side)
  { x: 18, y: 4 }, { x: 22, y: 4 }, { x: 26, y: 4 },
  { x: 18, y: 12 }, { x: 22, y: 12 }, { x: 26, y: 12 },
  { x: 18, y: 20 }, { x: 22, y: 20 }, { x: 26, y: 20 },
];

// Corridor X coordinate (between departments and open area)
export const HALLWAY_X = 14;

// Hallway waypoints for pathfinding
export const HALLWAY_POINTS: Position[] = [
  { x: 14, y: 4 },
  { x: 14, y: 8 },
  { x: 14, y: 12 },
  { x: 14, y: 16 },
  { x: 14, y: 20 },
];

// Map dimensions
export const MAP_WIDTH = 32;
export const MAP_HEIGHT = 24;
