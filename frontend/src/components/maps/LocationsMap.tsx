import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Maps'))
    document.head.appendChild(script)
  })

  return window.__locationsMapPromise
}

const getStatusVariant = (status?: string | null) => {
  if (!status) return { label: 'Nepoznato', color: '#a1a1aa' }
  if (status === 'O.K.') return { label: 'Aktivna', color: '#22c55e' }
  if (status === 'Potreban popravak - Dizalo u funkciji') return { label: 'Upozorenje', color: '#f59e0b' }
  if (status === 'Potreban popravak - Dizalo nije u funkciji') return { label: 'Neispravna', color: '#ef4444' }
  return { label: status, color: '#a1a1aa' }
}

const resolveLocationStatus = (location: LocationWithActivity) =>
  location.status || location.elevator_statuses?.[0]?.status || null

const buildInfoWindowContent = (location: LocationWithActivity) => {
  const address = location.address ?? '—'
  const status = resolveLocationStatus(location)
  const statusMeta = getStatusVariant(status)
  return `
    <div style="padding: 12px; max-width: 220px; font-size: 14px; color: #0f172a;">
      <div style="font-weight: 600; margin-bottom: 6px;">${location.name}</div>
      <div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">${address}</div>
      <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b;">
        <span style="display: inline-block; height: 8px; width: 8px; border-radius: 999px; background: ${statusMeta.color};"></span>
        <span>Status: ${statusMeta.label}</span>
      </div>
      <button id="location-info-${location.id}" style="margin-top: 10px; width: 100%; border: none; border-radius: 8px; padding: 8px 10px; background: #2563eb; color: white; font-size: 12px; font-weight: 600; cursor: pointer;">Otvori profil</button>
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

function LocationsMap({ locations }: LocationsMapProps) {
  const navigate = useNavigate()
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<GoogleMapInstance | null>(null)
  const markersRef = useRef<GoogleMarkerInstance[]>([])
  const infoWindowRef = useRef<GoogleInfoWindowInstance | null>(null)
  const mapsKey = useMemo(() => getGoogleMapsKey(), [])
  const [mapError, setMapError] = useState<string | null>(
    mapsKey ? null : 'Google Maps ključ nije konfiguriran.'
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
          })

          marker.addListener('mouseover', () => marker.setAnimation(maps.Animation.DROP))
          marker.addListener('mouseout', () => marker.setAnimation(null))

          marker.addListener('click', () => {
            if (!mapRef.current) return
            if (!infoWindowRef.current) {
              infoWindowRef.current = new maps.InfoWindow()
            }
            infoWindowRef.current.close()
            infoWindowRef.current.setContent(buildInfoWindowContent(location))
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
          setMapError('Ne možemo učitati Google Maps trenutno.')
        }
      })

    return () => {
      isMounted = false
    }
  }, [center, hasLocations, mapsKey, navigate, validLocations])

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
    </div>
  )
}

export default LocationsMap
