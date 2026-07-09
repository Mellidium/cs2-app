// The radar (2D overview) contract shared by the main-process extractor and the
// renderer's replay projector. Keep this file free of Node/DOM imports.

/**
 * Calibration from a CS2 `resource/overviews/<map>.txt` file. Maps world units
 * to normalized radar-image space:
 *   normX = (worldX - posX) / (scale * reference)      // 0..1 across width
 *   normY = (posY - worldY) / (scale * reference)      // 0..1 across height
 * `posX`/`posY` are the world coords of the radar's upper-left corner; `scale`
 * is world units per pixel at the `reference` resolution the radar was authored
 * for (1024 in CS2). The legacy `rotate`/`zoom` fields are ignored — the shipped
 * `_radar_psd` texture already aligns to this linear transform.
 */
export interface RadarCalibration {
  posX: number
  posY: number
  scale: number
  reference: number
}

/** A resolved radar for one map: the image plus its world→image calibration. */
export interface RadarAsset {
  map: string
  /** PNG as a `data:image/png;base64,...` URL, ready for an <img>/Image(). */
  image: string
  calibration: RadarCalibration
}
