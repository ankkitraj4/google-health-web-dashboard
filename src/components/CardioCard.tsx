import { useEffect, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import {
  getActiveMinutesDaily,
  getActiveZoneMinutesDaily,
  getDailyHeartRateZones,
  getDailyVo2Max,
  getTimeInHeartRateZoneDaily,
} from '../api/cardio';
import { useDateRange } from '../context/DateRangeContext';
import type {
  ActiveMinutesRollupDataPoint,
  ActiveZoneMinutesRollupDataPoint,
  DailyHeartRateZonesDataPoint,
  DailyVo2MaxDataPoint,
  TimeInHeartRateZoneRollupDataPoint,
} from '../types/health';
import { Card, EmptyCard, ErrorCard, LoadingCard } from './Card';

interface DayData {
  date: string;
  fatBurnAzm: number;
  cardioAzm: number;
  peakAzm: number;
  activeLight: number;
  activeModerate: number;
  activeVigorous: number;
  zoneModerate: number;
  zoneVigorous: number;
  zonePeak: number;
}

interface ZoneTotals {
  light: number;
  moderate: number;
  vigorous: number;
  peak: number;
}

interface ActiveTotals {
  light: number;
  moderate: number;
  vigorous: number;
}

const ZONE_COLORS = {
  fatBurn: '#22c55e',
  cardio: '#f97316',
  peak: '#ef4444',
  activeLight: '#38bdf8',
  moderate: '#f59e0b',
  vigorous: '#fb7185',
};

function dateLabel(point: { civilStartTime?: { date: { month: number; day: number } } }) {
  const d = point.civilStartTime?.date;
  return d ? `${d.month}/${d.day}` : '?';
}

function dateLabelFromDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateKeyFromPoint(point: {
  civilStartTime?: { date: { year: number; month: number; day: number } };
  civilEndTime?: { date: { year: number; month: number; day: number } };
  startTime?: string;
}) {
  const d = point.civilStartTime?.date;
  if (d) return dateKey(d.year, d.month, d.day);
  const end = point.civilEndTime?.date;
  if (end) return dateKey(end.year, end.month, end.day);
  if (!point.startTime) return null;
  const start = new Date(point.startTime);
  return dateKey(start.getFullYear(), start.getMonth() + 1, start.getDate());
}

function getVisibleDates(daysBack: number) {
  return Array.from({ length: daysBack }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (daysBack - 1 - index));
    return date;
  });
}

function parseIntValue(value?: string) {
  return parseInt(value || '0', 10) || 0;
}

function parseGoogleDurationMinutes(duration?: string) {
  if (!duration) return 0;
  const match = duration.match(/^(-?\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) / 60 : 0;
}

function labelFitnessLevel(level?: string) {
  if (!level || level === 'CARDIO_FITNESS_LEVEL_UNSPECIFIED') return 'Unknown';
  return level.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

type DatedField = { date?: { year: number; month: number; day: number } };

function latestByDate<T, K extends keyof T>(items: T[], key: K): T | undefined {
  return [...items].sort((a, b) => {
    const da = (a[key] as DatedField | undefined)?.date;
    const db = (b[key] as DatedField | undefined)?.date;
    const av = da ? new Date(da.year, da.month - 1, da.day).getTime() : 0;
    const bv = db ? new Date(db.year, db.month - 1, db.day).getTime() : 0;
    return bv - av;
  })[0];
}

interface CardioTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DayData }>;
  label?: string;
}

function CardioTooltip({ active, payload, label }: CardioTooltipProps) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;

  return (
    <div className="bg-slate-800 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-white font-medium mb-1">{label}</p>
      <p className="text-sky-300">Light active: {data.activeLight}m</p>
      <p className="text-amber-300">Moderate active: {data.activeModerate}m</p>
      <p className="text-rose-300">Vigorous active: {data.activeVigorous}m</p>
      <div className="border-t border-slate-700 my-1" />
      <p className="text-gray-300">Moderate HR zone: {Math.round(data.zoneModerate)}m</p>
      <p className="text-gray-300">Vigorous HR zone: {Math.round(data.zoneVigorous)}m</p>
      <p className="text-red-300">Peak HR zone: {Math.round(data.zonePeak)}m</p>
      <div className="border-t border-slate-700 my-1" />
      <p className="text-green-300">Fat burn AZM: {data.fatBurnAzm}</p>
      <p className="text-orange-300">Cardio AZM: {data.cardioAzm}</p>
      <p className="text-red-300">Peak AZM: {data.peakAzm}</p>
    </div>
  );
}

export function CardioCard() {
  const { accessToken } = useAuth();
  const { daysBack } = useDateRange();
  const [azmData, setAzmData] = useState<DayData[]>([]);
  const [zoneTotals, setZoneTotals] = useState<ZoneTotals>({ light: 0, moderate: 0, vigorous: 0, peak: 0 });
  const [activeTotals, setActiveTotals] = useState<ActiveTotals>({ light: 0, moderate: 0, vigorous: 0 });
  const [latestVo2, setLatestVo2] = useState<DailyVo2MaxDataPoint | undefined>();
  const [latestZones, setLatestZones] = useState<DailyHeartRateZonesDataPoint | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    // Reset state for a new fetch; this whole fetch-effect pattern moves to
    // backend-driven data in plan milestone M6.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    Promise.allSettled([
      getActiveZoneMinutesDaily(accessToken, daysBack),
      getTimeInHeartRateZoneDaily(accessToken, daysBack),
      getActiveMinutesDaily(accessToken, daysBack),
      getDailyVo2Max(accessToken, Math.max(daysBack, 30)),
      getDailyHeartRateZones(accessToken, Math.max(daysBack, 30)),
    ])
      .then(([azm, heartZones, activeMinutes, vo2, zones]) => {
        const failures = [azm, heartZones, activeMinutes, vo2, zones].filter((r) => r.status === 'rejected');
        if (failures.length === 5) {
          throw new Error(failures[0].reason?.message || 'Cardio metrics are unavailable');
        }

        const activePoints = activeMinutes.status === 'fulfilled' ? activeMinutes.value as ActiveMinutesRollupDataPoint[] : [];
        const active: ActiveTotals = { light: 0, moderate: 0, vigorous: 0 };
        const activeByDate = new Map<string, Pick<DayData, 'activeLight' | 'activeModerate' | 'activeVigorous'>>();
        for (const point of activePoints) {
          const key = dateKeyFromPoint(point);
          if (!key) continue;
          const dayActive = activeByDate.get(key) || { activeLight: 0, activeModerate: 0, activeVigorous: 0 };
          for (const item of point.activeMinutes?.activeMinutesRollupByActivityLevel || []) {
            const minutes = parseIntValue(item.activeMinutesSum);
            if (item.activityLevel === 'LIGHT') {
              active.light += minutes;
              dayActive.activeLight += minutes;
            }
            if (item.activityLevel === 'MODERATE') {
              active.moderate += minutes;
              dayActive.activeModerate += minutes;
            }
            if (item.activityLevel === 'VIGOROUS') {
              active.vigorous += minutes;
              dayActive.activeVigorous += minutes;
            }
          }
          activeByDate.set(key, dayActive);
        }
        setActiveTotals(active);

        const timePoints = heartZones.status === 'fulfilled' ? heartZones.value as TimeInHeartRateZoneRollupDataPoint[] : [];
        const totals: ZoneTotals = { light: 0, moderate: 0, vigorous: 0, peak: 0 };
        const zonesByDate = new Map<string, Pick<DayData, 'zoneModerate' | 'zoneVigorous' | 'zonePeak'>>();
        for (const point of timePoints) {
          const key = dateKeyFromPoint(point);
          const dayZones = key ? zonesByDate.get(key) || { zoneModerate: 0, zoneVigorous: 0, zonePeak: 0 } : null;
          for (const zone of point.timeInHeartRateZone?.timeInHeartRateZones || []) {
            const minutes = parseGoogleDurationMinutes(zone.duration);
            if (zone.heartRateZone === 'LIGHT') totals.light += minutes;
            if (zone.heartRateZone === 'MODERATE') {
              totals.moderate += minutes;
              if (dayZones) dayZones.zoneModerate += minutes;
            }
            if (zone.heartRateZone === 'VIGOROUS') {
              totals.vigorous += minutes;
              if (dayZones) dayZones.zoneVigorous += minutes;
            }
            if (zone.heartRateZone === 'PEAK') {
              totals.peak += minutes;
              if (dayZones) dayZones.zonePeak += minutes;
            }
          }
          if (key && dayZones) zonesByDate.set(key, dayZones);
        }
        setZoneTotals(totals);

        const azmPoints = azm.status === 'fulfilled' ? azm.value as ActiveZoneMinutesRollupDataPoint[] : [];
        const azmByDate = new Map<string, DayData>();
        for (const point of azmPoints) {
          const key = dateKeyFromPoint(point);
          if (!key) continue;
          const activeForDay = activeByDate.get(key) || { activeLight: 0, activeModerate: 0, activeVigorous: 0 };
          const zonesForDay = zonesByDate.get(key) || { zoneModerate: 0, zoneVigorous: 0, zonePeak: 0 };
          azmByDate.set(key, {
            date: dateLabel(point),
            fatBurnAzm: parseIntValue(point.activeZoneMinutes?.sumInFatBurnHeartZone),
            cardioAzm: parseIntValue(point.activeZoneMinutes?.sumInCardioHeartZone),
            peakAzm: parseIntValue(point.activeZoneMinutes?.sumInPeakHeartZone),
            ...activeForDay,
            ...zonesForDay,
          });
        }
        setAzmData(getVisibleDates(daysBack).map((date) => {
          const key = dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
          const activeForDay = activeByDate.get(key) || { activeLight: 0, activeModerate: 0, activeVigorous: 0 };
          const zonesForDay = zonesByDate.get(key) || { zoneModerate: 0, zoneVigorous: 0, zonePeak: 0 };
          return azmByDate.get(key) || {
            date: dateLabelFromDate(date),
            fatBurnAzm: 0,
            cardioAzm: 0,
            peakAzm: 0,
            ...activeForDay,
            ...zonesForDay,
          };
        }));

        setLatestVo2(vo2.status === 'fulfilled' ? latestByDate(vo2.value as DailyVo2MaxDataPoint[], 'dailyVo2Max') : undefined);
        setLatestZones(zones.status === 'fulfilled' ? latestByDate(zones.value as DailyHeartRateZonesDataPoint[], 'dailyHeartRateZones') : undefined);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, daysBack]);

  if (loading) return <LoadingCard title="Cardio" />;
  if (error) return <ErrorCard title="Cardio" error={error} />;

  const totalAzm = azmData.reduce((sum, d) => sum + d.fatBurnAzm + d.cardioAzm + d.peakAzm, 0);
  const cardioZoneMinutes = zoneTotals.moderate + zoneTotals.vigorous + zoneTotals.peak;
  const totalActiveMinutes = activeTotals.light + activeTotals.moderate + activeTotals.vigorous;

  if (totalAzm === 0 && cardioZoneMinutes === 0 && totalActiveMinutes === 0 && !latestVo2 && !latestZones) {
    return <EmptyCard title="Cardio" />;
  }

  return (
    <Card title="Cardio" subtitle={`Last ${daysBack} days`}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-gray-800/50 rounded-xl p-3">
          <p className="text-2xl font-bold">{totalAzm}</p>
          <p className="text-xs text-gray-400">active zone min</p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-3">
          <p className="text-2xl font-bold">{latestVo2 ? latestVo2.dailyVo2Max.vo2Max.toFixed(1) : '—'}</p>
          <p className="text-xs text-gray-400">VO2 max</p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-3">
          <p className="text-2xl font-bold">{Math.round(cardioZoneMinutes)}</p>
          <p className="text-xs text-gray-400">cardio HR zone min</p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-3">
          <p className="text-2xl font-bold">{totalActiveMinutes}</p>
          <p className="text-xs text-gray-400">active min</p>
        </div>
      </div>

      {azmData.length > 0 && (
        <div className="h-32">
          <ResponsiveContainer>
            <BarChart data={azmData}>
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<CardioTooltip />} />
              <Bar dataKey="activeLight" stackId="active" fill={ZONE_COLORS.activeLight} radius={[0, 0, 4, 4]} />
              <Bar dataKey="activeModerate" stackId="active" fill={ZONE_COLORS.moderate} />
              <Bar dataKey="activeVigorous" stackId="active" fill={ZONE_COLORS.vigorous} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export function HeartZonesCard() {
  const { accessToken } = useAuth();
  const { daysBack } = useDateRange();
  const [zoneTotals, setZoneTotals] = useState<ZoneTotals>({ light: 0, moderate: 0, vigorous: 0, peak: 0 });
  const [latestVo2, setLatestVo2] = useState<DailyVo2MaxDataPoint | undefined>();
  const [latestZones, setLatestZones] = useState<DailyHeartRateZonesDataPoint | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    // Reset state for a new fetch; this whole fetch-effect pattern moves to
    // backend-driven data in plan milestone M6.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    Promise.allSettled([
      getTimeInHeartRateZoneDaily(accessToken, daysBack),
      getDailyVo2Max(accessToken, Math.max(daysBack, 30)),
      getDailyHeartRateZones(accessToken, Math.max(daysBack, 30)),
    ])
      .then(([heartZones, vo2, zones]) => {
        const failures = [heartZones, vo2, zones].filter((r) => r.status === 'rejected');
        if (failures.length === 3) {
          throw new Error(failures[0].reason?.message || 'Heart zone metrics are unavailable');
        }

        const timePoints = heartZones.status === 'fulfilled' ? heartZones.value as TimeInHeartRateZoneRollupDataPoint[] : [];
        const totals: ZoneTotals = { light: 0, moderate: 0, vigorous: 0, peak: 0 };
        for (const point of timePoints) {
          for (const zone of point.timeInHeartRateZone?.timeInHeartRateZones || []) {
            const minutes = parseGoogleDurationMinutes(zone.duration);
            if (zone.heartRateZone === 'LIGHT') totals.light += minutes;
            if (zone.heartRateZone === 'MODERATE') totals.moderate += minutes;
            if (zone.heartRateZone === 'VIGOROUS') totals.vigorous += minutes;
            if (zone.heartRateZone === 'PEAK') totals.peak += minutes;
          }
        }
        setZoneTotals(totals);
        setLatestVo2(vo2.status === 'fulfilled' ? latestByDate(vo2.value as DailyVo2MaxDataPoint[], 'dailyVo2Max') : undefined);
        setLatestZones(zones.status === 'fulfilled' ? latestByDate(zones.value as DailyHeartRateZonesDataPoint[], 'dailyHeartRateZones') : undefined);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, daysBack]);

  if (loading) return <LoadingCard title="Heart Zones" />;
  if (error) return <ErrorCard title="Heart Zones" error={error} />;

  const cardioZoneMinutes = zoneTotals.moderate + zoneTotals.vigorous + zoneTotals.peak;

  if (cardioZoneMinutes === 0 && !latestVo2 && !latestZones) {
    return <EmptyCard title="Heart Zones" />;
  }

  return (
    <Card title="Heart Zones" subtitle="Moderate and above">
      <div className="space-y-2 text-xs">
        {[
          ['Moderate', zoneTotals.moderate, ZONE_COLORS.moderate],
          ['Vigorous', zoneTotals.vigorous, ZONE_COLORS.vigorous],
          ['Peak', zoneTotals.peak, ZONE_COLORS.peak],
        ].map(([label, minutes, color]) => {
          const pct = cardioZoneMinutes > 0 ? (Number(minutes) / cardioZoneMinutes) * 100 : 0;
          return (
            <div key={label as string}>
              <div className="flex justify-between text-gray-400 mb-1">
                <span>{label}</span>
                <span>{Math.round(Number(minutes))}m</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color as string }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
        <div className="bg-gray-800/50 rounded-lg px-3 py-2">
          <p className="text-white font-medium">{labelFitnessLevel(latestVo2?.dailyVo2Max.cardioFitnessLevel)}</p>
          <p className="text-gray-500">fitness level</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg px-3 py-2">
          <p className="text-white font-medium">Not exposed</p>
          <p className="text-gray-500">cardio load</p>
        </div>
      </div>

      <div className="border-t border-gray-800 mt-4 pt-3 text-xs text-gray-400">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {latestZones?.dailyHeartRateZones.heartRateZones
            .filter((zone) => zone.heartRateZoneType !== 'HEART_RATE_ZONE_TYPE_UNSPECIFIED')
            .map((zone) => (
              <p key={zone.heartRateZoneType}>
                {zone.heartRateZoneType.toLowerCase()}: {zone.minBeatsPerMinute}-{zone.maxBeatsPerMinute} bpm
              </p>
            ))}
        </div>
      </div>
    </Card>
  );
}
