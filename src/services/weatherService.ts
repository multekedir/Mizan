import type { WeatherLucideIconName, WeatherSnapshot } from './types';

const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

let cache: WeatherSnapshot | null = null;
let lastFetchTime = 0;

// Default fallback (Portland — align with prayer times)
let currentLat = 45.5152;
let currentLon = -122.6784;

export function setWeatherLocation(lat: number, lon: number) {
  currentLat = lat;
  currentLon = lon;
  cache = null;
  lastFetchTime = 0;
}

export function getCurrentLocation(): { lat: number; lon: number } {
  return { lat: currentLat, lon: currentLon };
}

/** Open-Meteo may return numeric strings — normalize before comparisons. */
function normalizeWmoCode(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** WMO Weather Code → Description (ranges aligned with icon mapping) */
function getWeatherDescription(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1 || code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Light rain';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Cloudy';
}

/** WMO Weather Code → Lucide icon name */
function getWeatherLucideName(code: number): WeatherLucideIconName {
  if (code === 0) return 'Sun';
  if (code === 1 || code === 2) return 'CloudSun';
  if (code === 3) return 'Cloud';
  if (code >= 45 && code <= 48) return 'CloudFog';
  if (code >= 51 && code <= 57) return 'CloudDrizzle';
  if (code >= 61 && code <= 67) return 'CloudRain';
  if (code >= 71 && code <= 77) return 'Snowflake';
  if (code >= 80 && code <= 82) return 'CloudRainWind';
  if (code >= 85 && code <= 86) return 'CloudSnow';
  if (code >= 95) return 'CloudLightning';
  return 'Cloud';
}

export async function fetchCurrentWeather(): Promise<WeatherSnapshot | null> {
  const now = Date.now();

  if (cache && !('lucideIcon' in cache)) {
    cache = null;
    lastFetchTime = 0;
  }

  if (cache && now - lastFetchTime < CACHE_DURATION_MS) {
    return cache;
  }

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', currentLat.toString());
    url.searchParams.set('longitude', currentLon.toString());
    url.searchParams.set('current', 'temperature_2m,weather_code');
    url.searchParams.set('temperature_unit', 'celsius');

    const res = await fetch(url.toString(), {
      cache: 'no-store',
    });

    if (!res.ok) throw new Error('Weather API error');

    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };

    const rawTemp = data.current?.temperature_2m;
    const parsedTemp =
      typeof rawTemp === 'number'
        ? rawTemp
        : typeof rawTemp === 'string'
          ? parseFloat(rawTemp)
          : NaN;
    const temp = Number.isFinite(parsedTemp) ? Math.round(parsedTemp) : 0;

    const code = normalizeWmoCode(data.current?.weather_code);

    const snapshot: WeatherSnapshot = {
      description: getWeatherDescription(code),
      tempC: temp,
      iconCode: String(code),
      lucideIcon: getWeatherLucideName(code),
      fetchedAt: now,
    };

    cache = snapshot;
    lastFetchTime = now;

    return snapshot;
  } catch (err) {
    console.warn('Failed to fetch weather:', err);
    return cache;
  }
}

export function clearWeatherCache(): void {
  cache = null;
  lastFetchTime = 0;
}

export type { WeatherSnapshot };
