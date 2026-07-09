export interface ClientToken {
  name: string;
  email?: string;
  password?: string;
  token: string;
  expirationDate: string | null;
  supportPhone: string;
  activeSessionsCount?: number;
  isOnline?: boolean;
  subscriptionType?: "demo" | "mensal" | "semestral";
  registrationDate?: string;
  sessions?: { sessionId: string; deviceId: string; lastActive: number }[];
}

export interface GCodeCommand {
  mode: number; // 0, 1, 2, 3, 71, 75, 76 etc.
  x: number | null; // Diameter value
  z: number | null; // Z value
  r: number | null; // Arc radius or cycle retract
  commaR: number | null; // Chamfer/Radius modifier
  commaC: number | null;
  n: number | null; // Sequence block number
  p: number | null; // Start block or cycle value
  q: number | null; // End block or cycle value
  u: number | null; // Finish allowance X or G71 cut depth
  w: number | null; // Finish allowance Z
  f: number | null; // Feed rate or thread pitch
  text: string; // Clean command text
  linhaOriginal: number; // Original line index in file
  isG75_Exec?: boolean;
  is2Line?: boolean;
  retractR?: number;
  targetX?: number | null;
  targetZ?: number | null;
  incX?: number;
  shiftZ?: number;
}

export interface SimulationPlotItem {
  type: "line" | "arc" | "arcTo" | "thread";
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  xc?: number; // Arc support coords
  zc?: number;
  radius?: number;
  isG3?: boolean;
  color: string;
  linhaId: number;
  text?: string;
  pitch?: number; // For thread pitch
}

export interface Point2D {
  x: number;
  y: number;
}
