/** Lucide component names resolved from WMO code (see weatherService `getWeatherIconName`) */
export type WeatherLucideIconName =
  | 'Sun'
  | 'CloudSun'
  | 'Cloud'
  | 'CloudFog'
  | 'CloudDrizzle'
  | 'CloudRain'
  | 'Snowflake'
  | 'CloudRainWind'
  | 'CloudSnow'
  | 'CloudLightning';

export interface WeatherSnapshot {
  description: string;
  tempC: number;
  /** WMO weather code as string */
  iconCode: string;
  lucideIcon: WeatherLucideIconName;
  fetchedAt: number;
}
