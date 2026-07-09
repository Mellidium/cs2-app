// World → canvas projection. Pure, no DOM. Auto-fit today; a radar-calibrated
// projector (pos_x/pos_y/scale triplet + radar image) can be added behind the
// same interface once radar assets exist.

import type { ReplayPayload } from '@shared/replay-types'

export interface WorldBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface Projector {
  toX(worldX: number): number
  toY(worldY: number): number
  /** World-units length → canvas px (for AoE radii, tracer lengths). */
  scaleLength(worldLen: number): number
}

/** Bounding box over every player frame and grenade point in the payload. */
export function boundsOf(payload: ReplayPayload): WorldBounds {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const extend = (x: number, y: number): void => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  for (const round of payload.rounds) {
    for (const frame of round.frames) {
      for (const p of frame.players) extend(p.x, p.y)
    }
    for (const g of round.grenades) {
      for (const pt of g.trajectory) extend(pt.x, pt.y)
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  return { minX, maxX, minY, maxY }
}

/**
 * Fits the world bounds into width×height with padding, preserving aspect
 * ratio and centering. CS2 +Y is world north — canvas Y is flipped.
 */
export function autoFitProjector(
  bounds: WorldBounds,
  width: number,
  height: number,
  padding = 28
): Projector {
  const worldW = Math.max(1, bounds.maxX - bounds.minX)
  const worldH = Math.max(1, bounds.maxY - bounds.minY)
  const scale = Math.min((width - padding * 2) / worldW, (height - padding * 2) / worldH)
  const offsetX = (width - worldW * scale) / 2
  const offsetY = (height - worldH * scale) / 2
  return {
    toX: (wx) => offsetX + (wx - bounds.minX) * scale,
    toY: (wy) => offsetY + (bounds.maxY - wy) * scale,
    scaleLength: (len) => len * scale
  }
}
