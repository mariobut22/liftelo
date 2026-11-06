import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { QrLabelData } from '../../services/api'
import { qrShape, qrUrl, shortCode } from '../../lib/qr'
import { QR_SHEET_LAYOUTS, SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from '../../lib/qrLayout'
import type { QrSheetLayout } from '../../lib/qrLayout'

export function QrCodeSvg({ text, className }: { text: string; className?: string }) {
  const shape = useMemo(() => qrShape(text), [text])
  return (
    <svg
      viewBox={shape.viewBox}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={text}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x={shape.viewBox.split(' ')[0]}
        y={shape.viewBox.split(' ')[1]}
        width={shape.viewBox.split(' ')[2]}
        height={shape.viewBox.split(' ')[3]}
        fill="#fff"
      />
      <path d={shape.path} fill="#000" />
    </svg>
  )
}

/**
 * One sticker. Everything is sized in `em`, and the font size is derived from the width of the wrapping cell
 * (container query), so the same label looks identical in the on-screen preview and in the printed grid.
 */
export function QrLabel({ data }: { data: QrLabelData }) {
  const { t } = useTranslation()
  const url = qrUrl(data.qr_token)
  return (
    <div className="qr-cell">
      <div className="qr-label" data-testid="qr-label">
        <QrCodeSvg text={url} className="qr-label__code" />
        <div className="qr-label__text">
          <div className="qr-label__location">{data.location_name}</div>
          <div className="qr-label__elevator">{data.label}</div>
          {data.serial_number ? (
            <div className="qr-label__meta">
              {t('locations:qr.labels.serialShort')} {data.serial_number}
            </div>
          ) : null}
          <div className="qr-label__footer">
            <span className="qr-label__brand">{t('common:appName')}</span>
            <span className="qr-label__id">{shortCode(data.qr_token)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The paged A4 sheet used for printing (rendered in a body-level portal, see QrLabels page). */
export function QrSheet({ labels, layout }: { labels: QrLabelData[]; layout: QrSheetLayout }) {
  const { cols, rows } = QR_SHEET_LAYOUTS[layout]
  const perPage = cols * rows
  const pages: QrLabelData[][] = []
  for (let i = 0; i < labels.length; i += perPage) pages.push(labels.slice(i, i + perPage))
  return (
    <>
      {pages.map((page, index) => (
        <div
          key={index}
          className="qr-sheet-page"
          style={{
            width: `${SHEET_WIDTH_MM}mm`,
            height: `${SHEET_HEIGHT_MM}mm`,
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            breakAfter: index < pages.length - 1 ? 'page' : 'auto',
          }}
        >
          {page.map((label) => (
            <QrLabel key={label.id} data={label} />
          ))}
        </div>
      ))}
    </>
  )
}
