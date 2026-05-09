import type { LucideIcon } from 'lucide-react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Snowflake,
  Sun,
} from 'lucide-react';
import type { WeatherLucideIconName } from '../../services/types';

const ICONS: Record<WeatherLucideIconName, LucideIcon> = {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  Snowflake,
  CloudRainWind,
  CloudSnow,
  CloudLightning,
};

export function WeatherLucide({
  name,
  className,
}: {
  name: WeatherLucideIconName;
  className?: string;
}) {
  const Cmp = ICONS[name] ?? Cloud;
  return <Cmp className={className} aria-hidden strokeWidth={2} />;
}
