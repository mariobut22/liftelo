import { create } from 'zustand'

/** Open/close state of the in-app QR scanner (Home button and the + menu open it, QrScanFlow in AppLayout renders it). */
type QrScanState = {
  open: boolean
  openScanner: () => void
  closeScanner: () => void
}

const useQrScanStore = create<QrScanState>((set) => ({
  open: false,
  openScanner: () => set({ open: true }),
  closeScanner: () => set({ open: false }),
}))

export default useQrScanStore
