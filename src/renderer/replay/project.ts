// World → canvas projection. Pure, no DOM. Two projectors share one interface:
// `autoFitProjector` frames the action when no radar is available, and
// `radarProjector` aligns world positions to a calibrated CS2 radar image.

import type { ReplayPayload } from '@shared/replay-types'
import type { RadarCalibration } from '@shared/radar-types'

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

/** The square canvas rect the radar image is drawn into (centered, padded). */
export interface RadarLayout {
  x: number
  y: number
  size: number
}

/** Largest centered square that fits width×height with padding. */
export function radarLayout(width: number, height: number, padding = 12): RadarLayout {
  const size = Math.max(1, Math.min(width, height) - padding * 2)
  return { x: (width - size) / 2, y: (height - size) / 2, size }
}

/**
 * Projects world units onto a calibrated radar drawn into `layout`. The radar
 * spans `scale * reference` world units across its full width; CS2 +Y is world
 * north, so canvas Y is flipped. See RadarCalibration for the transform.
 */
export function radarProjector(cal: RadarCalibration, layout: RadarLayout): Projector {
  const span = cal.scale * cal.reference
  const { x, y, size } = layout
  return {
    toX: (wx) => x + ((wx - cal.posX) / span) * size,
    toY: (wy) => y + ((cal.posY - wy) / span) * size,
    scaleLength: (len) => (len / span) * size
  }
}
