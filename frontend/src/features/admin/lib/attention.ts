import type { AdminStats } from '@px/contracts';

/**
 * Orders waiting on the studio itself. Approval waits on the client, so it is a queue on the
 * overview but not part of this number; the sidebar, the metric and the project cards all use it.
 */
export function studioAttention(a: AdminStats['attention']): number {
  return a.unpaid + a.handoff + a.toPrint + a.toShip + a.deadlineSoon;
}
