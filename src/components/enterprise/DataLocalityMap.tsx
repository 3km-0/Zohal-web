'use client';

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

/** Convert lat/lng to rough x/y percentages inside a 980×420 Mercator-ish box */
function toXY(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * 100;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = ((Math.PI - mercN) / (2 * Math.PI)) * 100;
  return { x: Math.max(1, Math.min(99, x)), y: Math.max(1, Math.min(99, y)) };
}

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

      {/* Dot-grid map — pure SVG, no external library */}
      <div className="relative h-[260px] w-full overflow-hidden rounded-scholar bg-[#0a1020]/70">
        <svg
          viewBox="0 0 980 420"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          aria-label="Global data region map"
        >
          {/* subtle grid lines */}
          {Array.from({ length: 19 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={(i + 1) * 49}
              y1={0}
              x2={(i + 1) * 49}
              y2={420}
              stroke="#1f2a3d"
              strokeWidth={0.5}
            />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <line
              key={`h${i}`}
              x1={0}
              y1={(i + 1) * 47}
              x2={980}
              y2={(i + 1) * 47}
              stroke="#1f2a3d"
              strokeWidth={0.5}
            />
          ))}

          {regions.map((region) => {
            const { x, y } = toXY(region.lat, region.lng);
            const cx = (x / 100) * 980;
            const cy = (y / 100) * 420;
            const isSelected = selectedRegionCode === region.region_code;
            const isCurrent = currentRegionCode === region.region_code;
            const fill = isCurrent ? '#22c55e' : isSelected ? '#f59e0b' : '#60a5fa';
            const r = isSelected ? 8 : 6;

            return (
              <g
                key={region.region_code}
                className="cursor-pointer"
                onClick={() => onSelectRegion(region)}
                role="button"
                aria-label={`${region.city}, ${region.country_code}`}
              >
                <circle r={r + 8} cx={cx} cy={cy} fill={fill} opacity={0.15} />
                <circle r={r} cx={cx} cy={cy} fill={fill} stroke="#f8fafc" strokeWidth={1.2} />
                <text
                  x={cx}
                  y={cy - r - 4}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize={9}
                  fontFamily="sans-serif"
                >
                  {region.region_code}
                </text>
              </g>
            );
          })}
        </svg>
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
                {isCurrent && (
                  <span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] text-success">
                    Current
                  </span>
                )}
              </div>
              <div>
                {region.city}, {region.country_code}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
