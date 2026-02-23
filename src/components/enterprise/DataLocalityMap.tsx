'use client';

import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { cn } from '@/lib/utils';

export interface DataLocalityRegion {
  region_code: string;
  city: string;
  country_code: string;
  lat: number;
  lng: number;
  compliance: string[];
  is_active: boolean;
}

interface DataLocalityMapProps {
  regions: DataLocalityRegion[];
  selectedRegionCode: string | null;
  currentRegionCode?: string | null;
  onSelectRegion: (region: DataLocalityRegion) => void;
}

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export function DataLocalityMap({
  regions,
  selectedRegionCode,
  currentRegionCode,
  onSelectRegion,
}: DataLocalityMapProps) {
  return (
    <div className="relative overflow-hidden rounded-scholar border border-border bg-[radial-gradient(circle_at_top,#1d2a3f_0%,#0f1726_45%,#0b1220_100%)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">Global Provisioning Map</h3>
        <span className="text-xs text-white/60">Tap a region node to provision</span>
      </div>

      <div className="relative h-[360px] w-full rounded-scholar bg-[#0a1020]/70">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 125, center: [10, 25] }}
          width={980}
          height={420}
          style={{ width: '100%', height: '100%' }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#1f2a3d"
                  stroke="#2e3c52"
                  strokeWidth={0.45}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none', fill: '#283a54' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {regions.map((region) => {
            const isSelected = selectedRegionCode === region.region_code;
            const isCurrent = currentRegionCode === region.region_code;
            return (
              <Marker
                key={region.region_code}
                coordinates={[region.lng, region.lat]}
                onClick={() => onSelectRegion(region)}
              >
                <g className="cursor-pointer">
                  <circle
                    r={isSelected ? 8 : 6}
                    fill={isCurrent ? '#22c55e' : isSelected ? '#f59e0b' : '#60a5fa'}
                    stroke="#f8fafc"
                    strokeWidth={1.2}
                  />
                  <circle
                    r={isSelected ? 16 : 13}
                    fill="none"
                    stroke={isCurrent ? '#22c55e' : '#60a5fa'}
                    strokeWidth={1.2}
                    className={cn('opacity-60', 'animate-pulse')}
                  />
                </g>
              </Marker>
            );
          })}
        </ComposableMap>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {regions.map((region) => {
          const isSelected = selectedRegionCode === region.region_code;
          const isCurrent = currentRegionCode === region.region_code;
          return (
            <button
              key={region.region_code}
              onClick={() => onSelectRegion(region)}
              className={cn(
                'rounded-scholar border px-3 py-2 text-left text-xs transition',
                isSelected
                  ? 'border-accent bg-accent/15 text-text'
                  : 'border-border bg-surface/50 text-text-soft hover:border-accent/50 hover:text-text',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{region.region_code}</span>
                {isCurrent && <span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] text-success">Current</span>}
              </div>
              <div>{region.city}, {region.country_code}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
