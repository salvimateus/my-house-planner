import { rrect } from '../bathroom/symbolKit.ts';

export const CHAIR = 440;
/** How far a tucked chair reaches past the table edge. */
export const CHAIR_REACH = 300;
const BACK = 60;

export interface ChairPaths {
  seats: string;
  backs: string;
}

/**
 * Appends one chair whose front faces the table. (ex, ey) is the point on the
 * table edge; `angle` is the outward normal in radians (0 = +x).
 */
export function addChair(out: ChairPaths, ex: number, ey: number, angle: number): void {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const rot = angle - Math.PI / 2;
  const seatOffset = CHAIR_REACH - CHAIR / 2;
  const backOffset = CHAIR_REACH - BACK / 2;
  out.seats += rrect(ex + ux * seatOffset, ey + uy * seatOffset, CHAIR, CHAIR, 60, rot);
  out.backs += rrect(ex + ux * backOffset, ey + uy * backOffset, CHAIR - 20, BACK, 25, rot);
}
