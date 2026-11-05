import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import trimCanvas from '../lib/trimCanvas'
import { useTranslation } from 'react-i18next'

 type SignaturePadHandle = {
  clear: () => void
  getPngDataUrl: () => string | null
  isEmpty: () => boolean
 }

 type SignaturePadProps = {
   disabled?: boolean
   label?: string
   clearLabel?: string
 }

 const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  ({ disabled, label, clearLabel }, ref) => {
  const { t } = useTranslation()

  const canvasRef = useRef<SignatureCanvas | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  // trimCanvas() resizes/re-assigns the canvas it is given, which resets the 2D context transform (the device-pixel-ratio
  // scale set up by signature_pad). Calling it on the LIVE canvas made every stroke after the first one draw at 1x scale,
  // i.e. smaller and shifted up/left on phones. Always trim a copy.
  const getTrimmedDataUrl = (): string | null => {
    const live = canvasRef.current?.getCanvas()
    if (!live) return null
    const copy = document.createElement('canvas')
    copy.width = live.width
    copy.height = live.height
    copy.getContext('2d')?.drawImage(live, 0, 0)
    return trimCanvas(copy).toDataURL('image/png')
  }

  useImperativeHandle(ref, () => ({
    clear: () => {
      canvasRef.current?.clear()
      setHasSignature(false)
      setDataUrl(null)
    },
    getPngDataUrl: () => {
      if (dataUrl) return dataUrl
      if (!canvasRef.current) return null
      const nextUrl = getTrimmedDataUrl()
      return nextUrl && nextUrl.length > 200 ? nextUrl : null
    },
    isEmpty: () => {
      if (hasSignature || dataUrl) return false
      return canvasRef.current ? canvasRef.current.isEmpty() : true
    },
  }))

  const handleEnd = () => {
    if (disabled || !canvasRef.current) return
    const nextUrl = getTrimmedDataUrl()
    if (nextUrl && nextUrl.length > 200) {
      setHasSignature(true)
      setDataUrl(nextUrl)
    }
  }

  return (
    <div className="space-y-2">
      {label ? <div className="text-sm font-medium text-zinc-700">{label}</div> : null}
      <div className={`rounded-lg border border-dashed border-zinc-300 bg-white ${disabled ? 'opacity-60' : ''}`}>
        <SignatureCanvas
          ref={canvasRef}
          penColor="#111827"
          canvasProps={{
            className: 'h-32 w-full rounded-lg',
          }}
          backgroundColor="white"
          throttle={8}
          minWidth={1.2}
          maxWidth={2.4}
          velocityFilterWeight={0.9}
          onBegin={() => {
            if (disabled) {
              canvasRef.current?.clear()
              setHasSignature(false)
              setDataUrl(null)
            }
          }}
          onEnd={handleEnd}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          canvasRef.current?.clear()
          setHasSignature(false)
          setDataUrl(null)
        }}
        disabled={disabled}
        className="text-xs font-semibold text-zinc-500 hover:text-zinc-700 disabled:opacity-60"
      >
        {clearLabel ?? t('common:actions.clear')}
      </button>
    </div>
  )
 }
)

 SignaturePad.displayName = 'SignaturePad'

 export type { SignaturePadHandle }
 export default SignaturePad
