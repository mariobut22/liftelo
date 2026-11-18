import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import i18n, { normalizeLanguage } from '../../i18n'
import { RMS_STATUS } from '../../lib/rmsStatus'
import type { FindingsByLocationItem } from '../../services/api'

import type { LocationWithActivity } from '../../types/location'

declare global {
  interface Window {
    __locationsMapPromise?: Promise<void>
    google?: GoogleMapsApi
  }
}

type GoogleMapsApi = {
  maps: {
    Map: new (el: HTMLElement, options: GoogleMapOptions) => GoogleMapInstance
    Marker: new (options: GoogleMarkerOptions) => GoogleMarkerInstance
    InfoWindow: new (options?: { content?: string }) => GoogleInfoWindowInstance
    LatLngBounds: new () => GoogleLatLngBoundsInstance
    Animation: { DROP: number }
    SymbolPath: { CIRCLE: number }
    event: {
      trigger: (target: unknown, eventName: string) => void
      addListenerOnce: (target: unknown, eventName: string, handler: () => void) => void
    }
  }
}

type GoogleMapOptions = {
  center: { lat: number; lng: number }
  zoom: number
  mapTypeControl: boolean
  streetViewControl: boolean
  fullscreenControl: boolean
}

type GoogleMapInstance = {
  setCenter: (center: { lat: number; lng: number }) => void
  setZoom: (zoom: number) => void
  fitBounds: (bounds: GoogleLatLngBoundsInstance) => void
}

type GoogleMarkerOptions = {
  position: { lat: number; lng: number }
  map?: GoogleMapInstance
  title?: string
  animation?: number
  icon?: {
    path: number
    scale: number
    fillColor: string
    fillOpacity: number
    strokeColor: string
    strokeWeight: number
  }
  label?: { text: string; color: string; fontSize: string; fontWeight: string }
}

type GoogleMarkerInstance = {
  setMap: (map: GoogleMapInstance | null) => void
  setAnimation: (animation: number | null) => void
  addListener: (event: string, handler: () => void) => void
  getPosition: () => { lat: () => number; lng: () => number } | null
}

type GoogleInfoWindowInstance = {
  setContent: (content: string) => void
  close: () => void
  open: (options: { map: GoogleMapInstance | null; anchor: GoogleMarkerInstance }) => void
}

type GoogleLatLngBoundsInstance = {
  extend: (position: { lat: () => number; lng: () => number } | null) => void
}

type LocationsMapProps = {
  locations: LocationWithActivity[]
  /** Open faults per location (from GET /api/findings/by-location); markers with open faults win over the RMS colour */
  faultsByLocation?: Map<number, FindingsByLocationItem>
}

const FALLBACK_CENTER = { lat: 45.1, lng: 15.2 }
const FALLBACK_ZOOM = 7
const DEFAULT_ZOOM = 12
const V1_GOOGLE_MAPS_KEY = 'AIzaSyC_bv1yYLg0ZZqby-XRWC9vOFQ_bQX-elw'

const getGoogleMapsKey = () => {
  const envKey = import.meta.env.VITE_GOOGLE_MAPS_KEY
  return envKey && typeof envKey === 'string' && envKey.length > 0 ? envKey : V1_GOOGLE_MAPS_KEY
}

const loadGoogleMaps = (key: string) => {
  if (typeof window === 'undefined') return Promise.resolve()
  const mapsApi = window.google?.maps
  if (mapsApi) return Promise.resolve()
  if (window.__locationsMapPromise) return window.__locationsMapPromise

  window.__locationsMapPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&language=${normalizeLanguage(i18n.language)}`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Maps'))
    document.head.appendChild(script)
  })

  return window.__locationsMapPromise
}

const getStatusVariant = (status: string | null | undefined, t: TFunction) => {
  if (!status) return { label: t('locations:locationsMap.unknown'), color: '#a1a1aa' }
  if (status === RMS_STATUS.ok) return { label: t('locations:locationsMap.statusActive'), color: '#22c55e' }
  if (status === RMS_STATUS.repairInService) return { label: t('locations:locationsMap.statusWarning'), color: '#f59e0b' }
  if (status === RMS_STATUS.repairOutOfService) return { label: t('locations:locationsMap.statusFaulty'), color: '#ef4444' }
  return { label: status, color: '#a1a1aa' }
}

const resolveLocationStatus = (location: LocationWithActivity) =>
  location.status || location.elevator_statuses?.[0]?.status || null

const FAULT_RED = '#dc2626'
const FAULT_AMBER = '#d97706'

/** Marker look: open faults win (out of service = red, others = amber, number = count); otherwise the last RMS status colour. */
const getMarkerStyle = (location: LocationWithActivity, faults: FindingsByLocationItem | undefined, t: TFunction) => {
  if (faults && faults.open > 0) {
    return { color: faults.out_of_service > 0 ? FAULT_RED : FAULT_AMBER, count: faults.open }
  }
  return { color: getStatusVariant(resolveLocationStatus(location), t).color, count: 0 }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const buildInfoWindowContent = (location: LocationWithActivity, t: TFunction, faults?: FindingsByLocationItem) => {
  const address = location.address ?? '—'
  const status = resolveLocationStatus(location)
  const statusMeta = getStatusVariant(status, t)
  const faultsLine =
    faults && faults.open > 0
      ? `<div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: ${faults.out_of_service > 0 ? FAULT_RED : FAULT_AMBER};">
        <span>${escapeHtml(t('findings:locationBadge.open', { count: faults.open }))}${faults.out_of_service > 0 ? ` · ${escapeHtml(t('findings:locationBadge.outOfService', { count: faults.out_of_service }))}` : ''}</span>
      </div>${faults.to_order > 0 ? `<div style="font-size: 12px; color: #0369a1; margin-bottom: 6px;">${escapeHtml(t('findings:locationBadge.toOrder'))}: ${faults.to_order}</div>` : ''}`
      : ''
  return `
    <div style="padding: 12px; max-width: 220px; font-size: 14px; color: #0f172a;">
      <div style="font-weight: 600; margin-bottom: 6px;">${location.name}</div>
      <div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">${address}</div>
      ${faultsLine}
      <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b;">
        <span style="display: inline-block; height: 8px; width: 8px; border-radius: 999px; background: ${statusMeta.color};"></span>
        <span>${t('locations:locationsMap.statusLabel')}: ${statusMeta.label}</span>
      </div>
      <button id="location-info-${location.id}" style="margin-top: 10px; width: 100%; border: none; border-radius: 8px; padding: 8px 10px; background: #2563eb; color: white; font-size: 12px; font-weight: 600; cursor: pointer;">${t('locations:locationsMap.openProfile')}</button>
    </div>
  `
}

const getCoordinate = (value?: string | number | null) => {
  if (value === null || value === undefined) return null
  const parsed = Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

const getValidLocations = (locations: LocationWithActivity[]) =>
  locations
    .map((location) => {
      const lat = getCoordinate(location.latitude ?? (location as { lat?: string | number | null }).lat)
      const lng = getCoordinate(location.longitude ?? (location as { lng?: string | number | null }).lng)
      if (lat === null || lng === null) return null
      return { ...location, __lat: lat, __lng: lng }
    })
    .filter((location): location is LocationWithActivity & { __lat: number; __lng: number } =>
      Boolean(location)
    )

const getCenter = (locations: LocationWithActivity[]) => {
  const first = getValidLocations(locations)[0]
  if (!first) return FALLBACK_CENTER
  return {
    lat: first.__lat,
    lng: first.__lng,
  }
}

const LEGEND = [
  { key: 'outOfService', color: FAULT_RED },
  { key: 'openFaults', color: FAULT_AMBER },
  { key: 'ok', color: '#22c55e' },
  { key: 'warning', color: '#f59e0b' },
  { key: 'faulty', color: '#ef4444' },
  { key: 'unknown', color: '#a1a1aa' },
] as const

function LocationsMap({ locations, faultsByLocation }: LocationsMapProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<GoogleMapInstance | null>(null)
  const markersRef = useRef<GoogleMarkerInstance[]>([])
  const infoWindowRef = useRef<GoogleInfoWindowInstance | null>(null)
  const mapsKey = useMemo(() => getGoogleMapsKey(), [])
  const [mapError, setMapError] = useState<string | null>(
    mapsKey ? null : t('locations:locationsMap.mapsKeyMissing')
  )

  const center = useMemo(() => getCenter(locations), [locations])
  const validLocations = useMemo(() => getValidLocations(locations), [locations])
  const hasLocations = validLocations.length > 0

  useEffect(() => {
    if (!mapsKey) return

    let isMounted = true

    loadGoogleMaps(mapsKey)
      .then(() => {
        const maps = window.google?.maps
        if (!isMounted || !mapContainerRef.current || !maps) return
        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapContainerRef.current, {
            center,
            zoom: hasLocations ? DEFAULT_ZOOM : FALLBACK_ZOOM,
            mapTypeControl: true,
            streetViewControl: true,
            fullscreenControl: true,
          })
        } else {
          maps.event.trigger(mapRef.current, 'resize')
          mapRef.current.setCenter(center)
          mapRef.current.setZoom(hasLocations ? DEFAULT_ZOOM : FALLBACK_ZOOM)
        }

        console.log('Rendering markers:', validLocations.length)

        markersRef.current.forEach((marker) => marker.setMap(null))
        markersRef.current = []

        infoWindowRef.current?.close()
        infoWindowRef.current = null

        validLocations.forEach((location) => {
          const marker = new maps.Marker({
            position: {
              lat: location.__lat,
              lng: location.__lng,
            },
            map: mapRef.current ?? undefined,
            title: location.name,
            animation: maps.Animation.DROP,
            ...(() => {
              const style = getMarkerStyle(location, faultsByLocation?.get(location.id), t)
              return {
                icon: {
                  path: maps.SymbolPath.CIRCLE,
                  scale: style.count > 0 ? 13 : 9,
                  fillColor: style.color,
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                },
                ...(style.count > 0
                  ? { label: { text: String(style.count), color: '#ffffff', fontSize: '12px', fontWeight: '700' } }
                  : {}),
              }
            })(),
          })

          marker.addListener('mouseover', () => marker.setAnimation(maps.Animation.DROP))
          marker.addListener('mouseout', () => marker.setAnimation(null))

          marker.addListener('click', () => {
            if (!mapRef.current) return
            if (!infoWindowRef.current) {
              infoWindowRef.current = new maps.InfoWindow()
            }
            infoWindowRef.current.close()
            infoWindowRef.current.setContent(buildInfoWindowContent(location, t, faultsByLocation?.get(location.id)))
            infoWindowRef.current.open({ map: mapRef.current, anchor: marker })

            maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
              const button = document.getElementById(`location-info-${location.id}`)
              if (!button) return
              button.addEventListener('click', () => {
                infoWindowRef.current?.close()
                navigate(`/dashboard/locations/${location.id}`)
              })
            })
          })

          markersRef.current.push(marker)
        })

        if (markersRef.current.length > 0 && mapRef.current) {
          const bounds = new maps.LatLngBounds()
          markersRef.current.forEach((marker) => bounds.extend(marker.getPosition()!))
          mapRef.current.fitBounds(bounds)
        }
      })
      .catch(() => {
        if (isMounted) {
          setMapError(t('locations:locationsMap.loadFailed'))
        }
      })

    return () => {
      isMounted = false
    }
  }, [center, hasLocations, mapsKey, navigate, validLocations, t, faultsByLocation])

  useEffect(() => {
    const maps = window.google?.maps
    if (!mapContainerRef.current || !mapRef.current || !maps) return

    const observer = new ResizeObserver(() => {
      maps.event.trigger(mapRef.current, 'resize')
      mapRef.current?.setCenter(center)
    })

    observer.observe(mapContainerRef.current)
    return () => observer.disconnect()
  }, [center])

  return (
    <div className="rounded-xl border border-zinc-200 shadow-sm">
      <div ref={mapContainerRef} className="h-[400px] w-full rounded-xl" />
      {mapError ? (
        <div className="px-4 py-3 text-sm text-zinc-500">{mapError}</div>
      ) : null}
      <div data-testid="map-legend" className="space-y-1 border-t border-zinc-200 px-4 py-3 text-xs text-zinc-600">
        <p className="font-semibold text-zinc-700">{t('locations:locationsMap.legend.title')}</p>
        <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {LEGEND.map((entry) => (
            <li key={entry.key} className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: entry.color }} />
              <span>{t(`locations:locationsMap.legend.${entry.key}`)}</span>
            </li>
          ))}
        </ul>
        <p className="text-zinc-500">{t('locations:locationsMap.legend.countHint')}</p>
      </div>
    </div>
  )
}

export default LocationsMap
