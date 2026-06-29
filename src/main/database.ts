import Database from 'better-sqlite3'
import { join } from 'node:path'
import type { AggregateStats, MatchSummary } from '@shared/types'

/**
 * better-sqlite3 wrapper. Synchronous, single-file, zero-config.
 *
 * The full schema lives in the project spec (SQLite Schema section). This stub
 * creates the `matches` table so the app boots and the IPC layer has something
 * real to query — flesh out the remaining tables (rounds, kill_events,
 * damage_events, grenade_events, death_positions, match_improvement_stats) as
 * the GSI writer and demo pipeline come online.
 */
export class AppDatabase {
  private db: Database.Database

  constructor(dataDir: string) {
    this.db = new Database(join(dataDir, 'cs2-companion.db'))
    this.db.pragma('journal_mode = WAL')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        steam_id    TEXT NOT NULL,
        map         TEXT NOT NULL,
        mode        TEXT,
        started_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at    DATETIME,
        ct_score    INTEGER DEFAULT 0,
        t_score     INTEGER DEFAULT 0,
        result      TEXT DEFAULT 'in_progress',
        demo_parsed BOOLEAN DEFAULT 0,
        share_code  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_matches_steam ON matches(steam_id);
    `)
  }

  getMatches(steamId: string, limit = 50): MatchSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, steam_id, map, mode, started_at, ended_at, ct_score, t_score, result, demo_parsed
         FROM matches WHERE steam_id = ? ORDER BY started_at DESC LIMIT ?`
      )
      .all(steamId, limit) as Record<string, unknown>[]

    return rows.map((r) => ({
      id: r.id as number,
      steamId: r.steam_id as string,
      map: r.map as string,
      mode: (r.mode as string) ?? null,
      startedAt: r.started_at as string,
      endedAt: (r.ended_at as string) ?? null,
      ctScore: r.ct_score as number,
      tScore: r.t_score as number,
      result: r.result as MatchSummary['result'],
      demoParsed: Boolean(r.demo_parsed)
    }))
  }

  getAggregateStats(steamId: string): AggregateStats {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS played FROM matches WHERE steam_id = ?`)
      .get(steamId) as { played: number }

    // Placeholder aggregation — real values come from rounds/kill_events once
    // those tables are populated by the GSI writer and demo enrichment.
    return {
      matchesPlayed: row.played,
      kills: 0,
      deaths: 0,
      assists: 0,
      kdRatio: 0,
      headshotPct: 0,
      winRate: 0,
      adr: 0,
      kastPct: 0
    }
  }

  close(): void {
    this.db.close()
  }
}
