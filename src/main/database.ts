import Database from 'better-sqlite3'
import { join } from 'node:path'
import type {
  AggregateStats,
  DemoPlayerStats,
  DemoSummary,
  MatchSummary
} from '@shared/types'

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

      CREATE TABLE IF NOT EXISTS demos (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        dem_path       TEXT NOT NULL UNIQUE,
        file_name      TEXT NOT NULL,
        map            TEXT NOT NULL,
        tick_rate      REAL NOT NULL DEFAULT 64,
        rounds         INTEGER NOT NULL,
        ct_start_score INTEGER NOT NULL DEFAULT 0,
        t_start_score  INTEGER NOT NULL DEFAULT 0,
        replay_path    TEXT,
        parsed_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        match_id       INTEGER REFERENCES matches(id)
      );

      CREATE TABLE IF NOT EXISTS demo_player_stats (
        demo_id             INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
        steam_id            TEXT NOT NULL,
        name                TEXT NOT NULL,
        starting_side       TEXT,
        won                 INTEGER NOT NULL DEFAULT 0,
        rounds_played       INTEGER NOT NULL DEFAULT 0,
        kills               INTEGER NOT NULL DEFAULT 0,
        deaths              INTEGER NOT NULL DEFAULT 0,
        assists             INTEGER NOT NULL DEFAULT 0,
        damage              INTEGER NOT NULL DEFAULT 0,
        adr                 REAL NOT NULL DEFAULT 0,
        headshot_kills      INTEGER NOT NULL DEFAULT 0,
        headshot_pct        REAL NOT NULL DEFAULT 0,
        kast_rounds         INTEGER NOT NULL DEFAULT 0,
        kast_pct            REAL NOT NULL DEFAULT 0,
        trade_kills         INTEGER NOT NULL DEFAULT 0,
        untraded_deaths     INTEGER NOT NULL DEFAULT 0,
        opening_kills       INTEGER NOT NULL DEFAULT 0,
        opening_deaths      INTEGER NOT NULL DEFAULT 0,
        multi_kills_2       INTEGER NOT NULL DEFAULT 0,
        multi_kills_3       INTEGER NOT NULL DEFAULT 0,
        multi_kills_4       INTEGER NOT NULL DEFAULT 0,
        multi_kills_5       INTEGER NOT NULL DEFAULT 0,
        clutch_1v1_attempts INTEGER NOT NULL DEFAULT 0,
        clutch_1v1_wins     INTEGER NOT NULL DEFAULT 0,
        clutch_1v2_attempts INTEGER NOT NULL DEFAULT 0,
        clutch_1v2_wins     INTEGER NOT NULL DEFAULT 0,
        flashes_thrown      INTEGER NOT NULL DEFAULT 0,
        enemies_flashed     INTEGER NOT NULL DEFAULT 0,
        enemy_blind_dur     REAL NOT NULL DEFAULT 0,
        teamflash_dur       REAL NOT NULL DEFAULT 0,
        flash_assists       INTEGER NOT NULL DEFAULT 0,
        utility_damage      INTEGER NOT NULL DEFAULT 0,
        plants              INTEGER NOT NULL DEFAULT 0,
        defuses             INTEGER NOT NULL DEFAULT 0,
        side_splits         TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (demo_id, steam_id)
      );
    `)
  }

  /** Insert (or replace, on re-import) a parsed demo and its player stats. */
  saveDemo(demo: {
    demPath: string
    fileName: string
    map: string
    tickRate: number
    rounds: number
    ctStartScore: number
    tStartScore: number
    replayPath: string
    players: DemoPlayerStats[]
  }): number {
    const save = this.db.transaction((): number => {
      const existing = this.db
        .prepare(`SELECT id FROM demos WHERE dem_path = ?`)
        .get(demo.demPath) as { id: number } | undefined
      if (existing) {
        this.db.prepare(`DELETE FROM demo_player_stats WHERE demo_id = ?`).run(existing.id)
        this.db.prepare(`DELETE FROM demos WHERE id = ?`).run(existing.id)
      }

      const { lastInsertRowid } = this.db
        .prepare(
          `INSERT INTO demos (dem_path, file_name, map, tick_rate, rounds, ct_start_score, t_start_score, replay_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          demo.demPath,
          demo.fileName,
          demo.map,
          demo.tickRate,
          demo.rounds,
          demo.ctStartScore,
          demo.tStartScore,
          demo.replayPath
        )
      const demoId = Number(lastInsertRowid)

      const insert = this.db.prepare(
        `INSERT INTO demo_player_stats (
           demo_id, steam_id, name, starting_side, won, rounds_played,
           kills, deaths, assists, damage, adr, headshot_kills, headshot_pct,
           kast_rounds, kast_pct, trade_kills, untraded_deaths,
           opening_kills, opening_deaths,
           multi_kills_2, multi_kills_3, multi_kills_4, multi_kills_5,
           clutch_1v1_attempts, clutch_1v1_wins, clutch_1v2_attempts, clutch_1v2_wins,
           flashes_thrown, enemies_flashed, enemy_blind_dur, teamflash_dur, flash_assists,
           utility_damage, plants, defuses, side_splits
         ) VALUES (${new Array(36).fill('?').join(', ')})`
      )
      for (const p of demo.players) {
        insert.run(
          demoId,
          p.steamId,
          p.name,
          p.startingSide,
          p.won ? 1 : 0,
          p.roundsPlayed,
          p.kills,
          p.deaths,
          p.assists,
          p.damage,
          p.adr,
          p.headshotKills,
          p.headshotPct,
          p.kastRounds,
          p.kastPct,
          p.tradeKills,
          p.untradedDeaths,
          p.openingKills,
          p.openingDeaths,
          p.multiKills2,
          p.multiKills3,
          p.multiKills4,
          p.multiKills5,
          p.clutch1v1Attempts,
          p.clutch1v1Wins,
          p.clutch1v2Attempts,
          p.clutch1v2Wins,
          p.flashesThrown,
          p.enemiesFlashed,
          p.enemyBlindDuration,
          p.teamflashDuration,
          p.flashAssists,
          p.utilityDamage,
          p.plants,
          p.defuses,
          JSON.stringify(p.sideSplits)
        )
      }
      return demoId
    })
    return save()
  }

  getDemoIdByPath(demPath: string): number | null {
    const row = this.db.prepare(`SELECT id FROM demos WHERE dem_path = ?`).get(demPath) as
      | { id: number }
      | undefined
    return row?.id ?? null
  }

  getDemos(): DemoSummary[] {
    const rows = this.db
      .prepare(`SELECT * FROM demos ORDER BY parsed_at DESC`)
      .all() as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as number,
      demPath: r.dem_path as string,
      fileName: r.file_name as string,
      map: r.map as string,
      rounds: r.rounds as number,
      ctStartScore: r.ct_start_score as number,
      tStartScore: r.t_start_score as number,
      tickRate: r.tick_rate as number,
      parsedAt: r.parsed_at as string,
      hasReplay: Boolean(r.replay_path)
    }))
  }

  getDemoReplayPath(demoId: number): string | null {
    const row = this.db.prepare(`SELECT replay_path FROM demos WHERE id = ?`).get(demoId) as
      | { replay_path: string | null }
      | undefined
    return row?.replay_path ?? null
  }

  getDemoStats(demoId: number): DemoPlayerStats[] {
    const rows = this.db
      .prepare(`SELECT * FROM demo_player_stats WHERE demo_id = ? ORDER BY kills DESC`)
      .all(demoId) as Record<string, unknown>[]
    return rows.map((r) => ({
      demoId: r.demo_id as number,
      steamId: r.steam_id as string,
      name: r.name as string,
      startingSide: (r.starting_side as DemoPlayerStats['startingSide']) ?? null,
      won: Boolean(r.won),
      roundsPlayed: r.rounds_played as number,
      kills: r.kills as number,
      deaths: r.deaths as number,
      assists: r.assists as number,
      damage: r.damage as number,
      adr: r.adr as number,
      headshotKills: r.headshot_kills as number,
      headshotPct: r.headshot_pct as number,
      kastRounds: r.kast_rounds as number,
      kastPct: r.kast_pct as number,
      tradeKills: r.trade_kills as number,
      untradedDeaths: r.untraded_deaths as number,
      openingKills: r.opening_kills as number,
      openingDeaths: r.opening_deaths as number,
      multiKills2: r.multi_kills_2 as number,
      multiKills3: r.multi_kills_3 as number,
      multiKills4: r.multi_kills_4 as number,
      multiKills5: r.multi_kills_5 as number,
      clutch1v1Attempts: r.clutch_1v1_attempts as number,
      clutch1v1Wins: r.clutch_1v1_wins as number,
      clutch1v2Attempts: r.clutch_1v2_attempts as number,
      clutch1v2Wins: r.clutch_1v2_wins as number,
      flashesThrown: r.flashes_thrown as number,
      enemiesFlashed: r.enemies_flashed as number,
      enemyBlindDuration: r.enemy_blind_dur as number,
      teamflashDuration: r.teamflash_dur as number,
      flashAssists: r.flash_assists as number,
      utilityDamage: r.utility_damage as number,
      plants: r.plants as number,
      defuses: r.defuses as number,
      sideSplits: JSON.parse((r.side_splits as string) || '{}')
    }))
  }

  deleteDemo(demoId: number): void {
    this.db.prepare(`DELETE FROM demo_player_stats WHERE demo_id = ?`).run(demoId)
    this.db.prepare(`DELETE FROM demos WHERE id = ?`).run(demoId)
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
