// Paints one ViewState onto a Canvas2D context. Pure drawing — no React, no
// clocks, no data fetching. Colors come from the passed theme so the module
// stays reusable (and testable) outside the app shell.

import type { Projector } from './project'
import type { ViewGrenade, ViewPlayer, ViewState } from './playback'

export interface ReplayTheme {
  ct: string
  t: string
  ctDim: string
  tDim: string
  dead: string
  text: string
  smoke: string
  fire: string
  he: string
  flash: string
  decoy: string
  shotTracer: string
  killTracer: string
  bomb: string
}

export const DEFAULT_THEME: ReplayTheme = {
  ct: '#60a5fa',
  t: '#fbbf24',
  ctDim: 'rgba(96, 165, 250, 0.35)',
  tDim: 'rgba(251, 191, 36, 0.35)',
  dead: '#52525b',
  text: '#e4e4e7',
  smoke: '#a1a1aa',
  fire: '#f97316',
  he: '#f87171',
  flash: '#fef9c3',
  decoy: '#a3e635',
  shotTracer: 'rgba(228, 228, 231, 0.45)',
  killTracer: 'rgba(248, 113, 113, 0.9)',
  bomb: '#ef4444'
}

const PLAYER_RADIUS = 8
const SHOT_RAY_WORLD = 1200

export function drawScene(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  proj: Projector,
  theme: ReplayTheme = DEFAULT_THEME
): void {
  // Grenade effects go under everything else.
  for (const g of view.grenades) drawGrenade(ctx, g, proj, theme, view.tick)

  // Tracers under players.
  for (const tr of view.tracers) {
    ctx.save()
    ctx.globalAlpha = tr.fade * (tr.kind === 'shot' ? 0.6 : 0.9)
    ctx.strokeStyle = tr.kind === 'shot' ? theme.shotTracer : theme.killTracer
    ctx.lineWidth = tr.kind === 'shot' ? 1 : 1.5
    ctx.beginPath()
    ctx.moveTo(proj.toX(tr.fromX), proj.toY(tr.fromY))
    if (tr.toX !== null && tr.toY !== null) {
      ctx.lineTo(proj.toX(tr.toX), proj.toY(tr.toY))
    } else if (tr.yaw !== null) {
      const rad = (tr.yaw * Math.PI) / 180
      const endX = tr.fromX + Math.cos(rad) * SHOT_RAY_WORLD
      const endY = tr.fromY + Math.sin(rad) * SHOT_RAY_WORLD
      ctx.lineTo(proj.toX(endX), proj.toY(endY))
    }
    ctx.stroke()
    ctx.restore()
  }

  // Bomb.
  if (view.bomb) drawBomb(ctx, view.bomb.x, view.bomb.y, view.bomb.state, proj, theme, view.tick)

  // Dead players first (under living dots).
  for (const p of view.players) if (!p.alive) drawDead(ctx, p, proj, theme)
  for (const p of view.players) if (p.alive) drawPlayer(ctx, p, proj, theme)

  // C4 explosion on top.
  if (view.explosion) {
    const { x, y, progress } = view.explosion
    const px = proj.toX(x)
    const py = proj.toY(y)
    ctx.save()
    // Fireball.
    ctx.globalAlpha = 1 - progress
    const fireball = ctx.createRadialGradient(px, py, 0, px, py, 24 + progress * 30)
    fireball.addColorStop(0, '#fef08a')
    fireball.addColorStop(0.5, theme.fire)
    fireball.addColorStop(1, 'rgba(249, 115, 22, 0)')
    ctx.fillStyle = fireball
    ctx.beginPath()
    ctx.arc(px, py, 24 + progress * 30, 0, Math.PI * 2)
    ctx.fill()
    // Shock ring.
    ctx.globalAlpha = (1 - progress) * 0.8
    ctx.strokeStyle = theme.flash
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(px, py, 10 + progress * proj.scaleLength(600), 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

function sideColor(p: ViewPlayer, theme: ReplayTheme): string {
  return p.side === 'CT' ? theme.ct : p.side === 'T' ? theme.t : theme.dead
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  p: ViewPlayer,
  proj: Projector,
  theme: ReplayTheme
): void {
  const x = proj.toX(p.x)
  const y = proj.toY(p.y)
  const r = PLAYER_RADIUS
  const color = sideColor(p, theme)
  const dim = p.side === 'CT' ? theme.ctDim : p.side === 'T' ? theme.tDim : theme.dead

  ctx.save()

  // View direction wedge.
  const rad = (-p.yaw * Math.PI) / 180 // canvas Y is flipped
  ctx.globalAlpha = 0.5
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.arc(x, y, r * 2.1, rad - 0.45, rad + 0.45)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1

  // Dot: dimmed disc with a bottom-up HP fill.
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = dim
  ctx.fill()
  const hpFrac = Math.max(0, Math.min(1, p.hp / 100))
  if (hpFrac > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = color
    ctx.fillRect(x - r, y + r - 2 * r * hpFrac, 2 * r, 2 * r * hpFrac)
    ctx.restore()
  }

  // Damage blink under, flash whiteout on top.
  if (p.hurt > 0) {
    ctx.globalAlpha = p.hurt * 0.7
    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  if (p.flash > 0) {
    ctx.globalAlpha = p.flash
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // Outline + name.
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = theme.text
  ctx.globalAlpha = 0.85
  ctx.font = '10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(p.name.slice(0, 14), x, y - r - 4)
  ctx.restore()
}

function drawDead(
  ctx: CanvasRenderingContext2D,
  p: ViewPlayer,
  proj: Projector,
  theme: ReplayTheme
): void {
  const x = proj.toX(p.x)
  const y = proj.toY(p.y)
  const s = 5
  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.strokeStyle = sideColor(p, theme)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x - s, y - s)
  ctx.lineTo(x + s, y + s)
  ctx.moveTo(x + s, y - s)
  ctx.lineTo(x - s, y + s)
  ctx.stroke()
  ctx.restore()
}

function drawGrenade(
  ctx: CanvasRenderingContext2D,
  g: ViewGrenade,
  proj: Projector,
  theme: ReplayTheme,
  tick: number
): void {
  const x = proj.toX(g.x)
  const y = proj.toY(g.y)
  ctx.save()

  if (g.phase === 'flight') {
    // Small dot in flight.
    ctx.globalAlpha = 0.9
    ctx.fillStyle = grenadeColor(g.type, theme)
    ctx.beginPath()
    ctx.arc(x, y, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  const r = Math.max(6, proj.scaleLength(g.radius))
  if (g.type === 'smoke') {
    drawSmokeCloud(ctx, x, y, r, g.fade, theme, tick)
  } else if (g.type === 'molotov' || g.type === 'incendiary') {
    drawFire(ctx, x, y, r, g.fade, theme, tick)
  } else if (g.type === 'he') {
    ctx.globalAlpha = g.fade * 0.8
    ctx.fillStyle = theme.he
    ctx.beginPath()
    ctx.arc(x, y, r * (1.2 - g.fade * 0.4), 0, Math.PI * 2)
    ctx.fill()
  } else if (g.type === 'flashbang') {
    ctx.globalAlpha = g.fade * 0.9
    ctx.fillStyle = theme.flash
    ctx.beginPath()
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = theme.flash
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, r * (1.4 - g.fade * 0.6), 0, Math.PI * 2)
    ctx.stroke()
  } else if (g.type === 'decoy') {
    ctx.globalAlpha = g.fade * 0.9
    ctx.fillStyle = theme.decoy
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = theme.decoy
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, 7 + ((tick / 16) % 4), 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

/** Dense core ringed by translucent puffs that slowly rotate with the tick. */
function drawSmokeCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fade: number,
  theme: ReplayTheme,
  tick: number
): void {
  const spin = tick * 0.002
  ctx.globalAlpha = 0.5 * fade
  ctx.fillStyle = theme.smoke
  ctx.beginPath()
  ctx.arc(x, y, r * 0.62, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.28 * fade
  for (let i = 0; i < 7; i++) {
    const a = spin + (i * Math.PI * 2) / 7
    ctx.beginPath()
    ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Warm tongues whose size/alpha pulse with the tick. */
function drawFire(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fade: number,
  theme: ReplayTheme,
  tick: number
): void {
  const flicker = 0.85 + 0.15 * Math.sin(tick * 0.35)
  ctx.globalAlpha = 0.45 * fade * flicker
  ctx.fillStyle = theme.fire
  ctx.beginPath()
  ctx.arc(x, y, r * 0.8 * flicker, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.6 * fade
  for (let i = 0; i < 5; i++) {
    const a = tick * 0.05 + (i * Math.PI * 2) / 5
    const rr = r * (0.35 + 0.12 * Math.sin(tick * 0.3 + i * 2))
    ctx.beginPath()
    ctx.arc(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35, rr * 0.5, 0, Math.PI * 2)
    ctx.fillStyle = i % 2 === 0 ? '#fbbf24' : theme.fire
    ctx.fill()
  }
}

function grenadeColor(type: string, theme: ReplayTheme): string {
  switch (type) {
    case 'smoke':
      return theme.smoke
    case 'molotov':
    case 'incendiary':
      return theme.fire
    case 'he':
      return theme.he
    case 'flashbang':
      return theme.flash
    case 'decoy':
      return theme.decoy
    default:
      return theme.text
  }
}

function drawBomb(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  state: 'carried' | 'dropped' | 'planted' | 'defused',
  proj: Projector,
  theme: ReplayTheme,
  tick: number
): void {
  const x = proj.toX(wx)
  const y = proj.toY(wy)
  ctx.save()
  if (state === 'carried') {
    // Small marker riding the carrier's dot.
    ctx.fillStyle = theme.bomb
    ctx.beginPath()
    ctx.arc(x + 7, y + 7, 3, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // C4 body.
    ctx.globalAlpha = state === 'defused' ? 0.6 : 1
    ctx.fillStyle = state === 'defused' ? theme.dead : '#3f3f46'
    ctx.strokeStyle = theme.bomb
    ctx.lineWidth = 1.5
    ctx.fillRect(x - 6, y - 4, 12, 8)
    ctx.strokeRect(x - 6, y - 4, 12, 8)
    // Blinking light while planted.
    if (state === 'planted' && Math.floor(tick / 32) % 2 === 0) {
      ctx.fillStyle = theme.bomb
      ctx.beginPath()
      ctx.arc(x + 3, y - 1, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
    if (state === 'defused') {
      ctx.strokeStyle = theme.ct
      ctx.beginPath()
      ctx.moveTo(x - 8, y + 6)
      ctx.lineTo(x - 2, y + 10)
      ctx.lineTo(x + 9, y - 8)
      ctx.stroke()
    }
  }
  ctx.restore()
}
