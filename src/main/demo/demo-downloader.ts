// Steam Game Coordinator integration (steam-user + globaloffensive).
//
// Requires the Steam client to be running and logged in. Fetches the recent
// matchmaking match list as share codes, resolves the target match by map +
// timestamp correlation, downloads the .dem.gz, and decompresses to a temp .dem.
//
// Stub — see the spec's "Post-Match Demo Enrichment" → "Source 1" for the flow.

export interface DemoDownloadResult {
  demPath: string
  shareCode: string
}

export async function downloadLatestDemo(_map: string, _endedAt: number): Promise<DemoDownloadResult> {
  throw new Error('demo-downloader: not yet implemented')
}
