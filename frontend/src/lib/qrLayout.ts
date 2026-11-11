export type QrSheetLayout = '3x8' | '2x5'

export const QR_SHEET_LAYOUTS: Record<QrSheetLayout, { cols: number; rows: number }> = {
  '3x8': { cols: 3, rows: 8 },
  '2x5': { cols: 2, rows: 5 },
}

// A4 minus 8 mm @page margin on every side
export const SHEET_WIDTH_MM = 194
export const SHEET_HEIGHT_MM = 281
