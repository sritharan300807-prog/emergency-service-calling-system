import { useEffect, useRef } from 'react';
import L from 'leaflet';

/** Center of India, used as the default "all of India" view. */
const INDIA_CENTER = { lat: 22.5937, lng: 78.9629 };
const INDIA_ZOOM = 5;

let mapsPromise: Promise<void> | null = null;
let mapsKey = '';

function resolveApiKey(): string {
  try {
    return (import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '').trim();
  } catch {
    return '';
  }
}

/** Injects the Google Maps JS API script exactly once; resolves when ready. */
function loadGoogleMaps(key: string, libraries: string[] = ['places']): Promise<void> {
  if (mapsPromise && mapsKey === key) return mapsPromise;
  mapsKey = key;
  mapsPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('No window'));
      return;
    }
    if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    const libs = libraries.length ? `&libraries=${libraries.join(',')}` : '';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key
    )}${libs}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });
  return mapsPromise;
}

const ACCIDENT_ICON = L.divIcon({
  className: '',
  html: `<div style="width:34px;height:34px;background:#dc2626;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:700;border-radius:50% 50% 50% 0;transform:rotate(-45deg)">!</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 30],
});

const VEHICLE_ICON = L.divIcon({
  className: '',
  html: `<div style="width:26px;height:26px;background:#2563eb;border:3px solid #fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700">V</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function accidentIconUrl(encodeURIComponentFn: (s: string) => string): string {
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponentFn(
      `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><g transform="rotate(45 18 18)"><circle cx="18" cy="18" r="15" fill="#dc2626" stroke="#ffffff" stroke-width="3"/></g><text x="18" y="24" font-family="Arial" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">!</text></svg>`
    )
  );
}

function vehicleIconUrl(encodeURIComponentFn: (s: string) => string): string {
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponentFn(
      `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><rect x="3" y="3" width="24" height="24" rx="10" fill="#2563eb" stroke="#ffffff" stroke-width="3"/><text x="9" y="21" font-family="Arial" font-size="14" font-weight="bold" fill="#ffffff">V</text></svg>`
    )
  );
}

interface GoogleMapHandle {
  map: google.maps.Map;
  marker?: google.maps.Marker;
}

/**
 * Map component. Uses Google Maps when a key is configured, otherwise falls
 * back to Leaflet + OpenStreetMap (which still covers the whole of India).
 * When no coordinates are given it shows the full India view.
 */
export function MapView({
  latitude,
  longitude,
  marker = 'vehicle',
  height = '320px',
  zoom,
  autoFocus = true,
}: {
  latitude: number | null;
  longitude: number | null;
  marker?: 'vehicle' | 'accident' | 'none';
  height?: string;
  zoom?: number;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | GoogleMapHandle | null>(null);
  const leafletMarkerRef = useRef<L.Marker | null>(null);
  const apiKey = resolveApiKey();

  const hasCoords = latitude != null && longitude != null;
  const center = hasCoords
    ? { lat: latitude as number, lng: longitude as number }
    : INDIA_CENTER;
  const defaultZoom = zoom ?? (hasCoords ? 14 : INDIA_ZOOM);

  // Primary create/teardown.
  useEffect(() => {
    if (!ref.current) return;

    if (apiKey) {
      let cancelled = false;
      const el = ref.current;
      loadGoogleMaps(apiKey)
        .then(() => {
          if (cancelled || !el.isConnected) return;
          const g = window.google.maps;
          const map = new g.Map(el, {
            center,
            zoom: defaultZoom,
            zoomControl: true,
            disableDefaultUI: false,
          });
          const handle: GoogleMapHandle = { map };
          if (marker !== 'none') {
            const iconUrl =
              marker === 'accident' ? accidentIconUrl(encodeURIComponent) : vehicleIconUrl(encodeURIComponent);
            const m = new g.Marker({
              position: center,
              map,
              title: marker === 'accident' ? 'Accident location' : 'Vehicle location',
              icon: { url: iconUrl, scaledSize: new g.Size(marker === 'accident' ? 36 : 30, marker === 'accident' ? 36 : 30) },
            });
            handle.marker = m;
            m.addListener('click', () => {
              new g.InfoWindow({
                content:
                  '<b>' +
                  (marker === 'accident' ? 'Accident location' : 'Vehicle location') +
                  '</b><br/>Lat: ' +
                  center.lat.toFixed(5) +
                  ', Lng: ' +
                  center.lng.toFixed(5),
              }).open(map, m);
            });
          }
          mapRef.current = handle;
        })
        .catch(() => {
          if (!cancelled) initLeaflet(el);
        });
      return () => {
        cancelled = true;
      };
    }

    initLeaflet(ref.current);
    return () => {
      if (mapRef.current instanceof L.Map) mapRef.current.remove();
      mapRef.current = null;
      leafletMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function initLeaflet(el: HTMLDivElement) {
    const map = L.map(el, { zoomControl: true, attributionControl: true });
    map.setView([center.lat, center.lng], defaultZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    if (marker !== 'none') {
      const icon = marker === 'accident' ? ACCIDENT_ICON : VEHICLE_ICON;
      leafletMarkerRef.current = L.marker([center.lat, center.lng], { icon }).addTo(map);
    }
  }

  // Keep marker/center in sync when coordinates change.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (m instanceof L.Map) {
      // Leaflet fallback map.
      if (hasCoords) {
        if (marker !== 'none' && leafletMarkerRef.current) {
          leafletMarkerRef.current.setLatLng([latitude as number, longitude as number]);
        }
        if (autoFocus) m.setView([latitude as number, longitude as number], zoom ?? defaultZoom);
      } else if (autoFocus) {
        m.setView([INDIA_CENTER.lat, INDIA_CENTER.lng], INDIA_ZOOM);
      }
    } else if (hasCoords) {
      if (m.marker) m.marker.setPosition({ lat: latitude as number, lng: longitude as number });
      if (autoFocus) m.map.panTo({ lat: latitude as number, lng: longitude as number });
    } else if (autoFocus) {
      m.map.setZoom(INDIA_ZOOM);
      m.map.panTo(INDIA_CENTER);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, zoom, autoFocus]);

  return <div ref={ref} style={{ height, width: '100%' }} className="rounded-xl overflow-hidden" />;
}