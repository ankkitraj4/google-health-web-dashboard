import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { getDailyHeartRate, type HeartRateSample } from '../api/heart-rate';
import { getDailyHeartRateZones } from '../api/cardio';
import type { DailyHeartRateZonesDataPoint } from '../types/health';
import { Card, LoadingCard, ErrorCard, EmptyCard } from './Card';

interface ZoneThresholds {
  light: number;
  moderate: number;
  vigorous: number;
  peak: number;
}

const DEFAULT_ZONES: ZoneThresholds = { light: 104, moderate: 134, vigorous: 153, peak: 171 };

interface ChartPoint {
  hour: number;
  timeLabel: string;
  bpm: number;
}

function parseZones(zoneDays: DailyHeartRateZonesDataPoint[]): ZoneThresholds | null {
  if (zoneDays.length === 0) return null;
  const latest = zoneDays[zoneDays.length - 1];
  const zoneList = latest.dailyHeartRateZones?.heartRateZones || [];
  const get = (type: string) => {
    const z = zoneList.find((z) => z.heartRateZoneType === type);
    return z ? parseInt(z.minBeatsPerMinute, 10) : 0;
  };
  const light = get('LIGHT');
  const moderate = get('MODERATE');
  const vigorous = get('VIGOROUS');
  const peak = get('PEAK');
  if (light && moderate && vigorous && peak) return { light, moderate, vigorous, peak };
  return null;
}

export function DailyHrCard() {
  const { accessToken } = useAuth();
  const [samples, setSamples] = useState<HeartRateSample[]>([]);
  const [zones, setZones] = useState<ZoneThresholds>(DEFAULT_ZONES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  useEffect(() => {
    if (!accessToken) return;
    // Reset state for a new fetch; this whole fetch-effect pattern moves to
    // backend-driven data in plan milestone M6.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    Promise.all([
      getDailyHeartRate(accessToken, selectedDay),
      getDailyHeartRateZones(accessToken, 7).catch(() => []),
    ])
      .then(([hrSamples, zoneDays]) => {
        setSamples(hrSamples);
        const parsed = parseZones(zoneDays);
        if (parsed) setZones(parsed);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, selectedDay]);

  function prevDay() {
    const d = new Date(selectedDay);
    d.setDate(d.getDate() - 1);
    setSelectedDay(d);
  }

  function nextDay() {
    const d = new Date(selectedDay);
    d.setDate(d.getDate() + 1);
    if (d <= new Date()) setSelectedDay(d);
  }

  const isToday = selectedDay.toDateString() === new Date().toDateString();
  const dateLabel = isToday ? 'Today' : selectedDay.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  if (loading) return <LoadingCard title="Heart Rate" />;
  if (error) return <ErrorCard title="Heart Rate" error={error} />;
  if (samples.length === 0) return <EmptyCard title="Heart Rate" />;

  const data: ChartPoint[] = samples.map((s) => {
    const d = new Date(s.time);
    const hours = d.getHours() + d.getMinutes() / 60;
    return {
      hour: Math.round(hours * 100) / 100,
      timeLabel: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      bpm: s.bpm,
    };
  });

  const maxBpm = Math.max(...data.map((d) => d.bpm), zones.peak + 10);
  const minBpm = Math.max(40, Math.min(...data.map((d) => d.bpm)) - 5);
  const domainMin = minBpm - 5;
  const domainMax = maxBpm + 5;

  const avgBpm = Math.round(data.reduce((s, d) => s + d.bpm, 0) / data.length);
  const peakBpm = Math.max(...data.map((d) => d.bpm));
  const lowBpm = Math.min(...data.map((d) => d.bpm));

  // Split data into zone-colored series for line segments
  type ZonedPoint = { hour: number; light?: number; moderate?: number; vigorous?: number; peak?: number };
  const zonedData: ZonedPoint[] = data.map((d) => {
    const z: ZonedPoint = { hour: d.hour };
    if (d.bpm >= zones.peak) z.peak = d.bpm;
    else if (d.bpm >= zones.vigorous) z.vigorous = d.bpm;
    else if (d.bpm >= zones.moderate) z.moderate = d.bpm;
    else z.light = d.bpm;
    return z;
  });
  // Add bridge points at zone transitions so lines connect
  for (let i = 1; i < zonedData.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const prevZone = prev.bpm >= zones.peak ? 'peak' : prev.bpm >= zones.vigorous ? 'vigorous' : prev.bpm >= zones.moderate ? 'moderate' : 'light';
    const currZone = curr.bpm >= zones.peak ? 'peak' : curr.bpm >= zones.vigorous ? 'vigorous' : curr.bpm >= zones.moderate ? 'moderate' : 'light';
    if (prevZone !== currZone) {
      zonedData[i][prevZone as keyof Omit<ZonedPoint, 'hour'>] = curr.bpm;
      zonedData[i - 1][currZone as keyof Omit<ZonedPoint, 'hour'>] = prev.bpm;
    }
  }

  return (
    <Card title="Heart Rate" subtitle={dateLabel}>
      <div className="flex justify-between items-center mb-2">
        <button onClick={prevDay} className="text-gray-400 hover:text-white text-sm px-1 cursor-pointer">&larr;</button>
        <div className="flex gap-4 text-xs text-gray-400">
          <span>Avg <span className="text-white font-medium">{avgBpm}</span> bpm</span>
          <span>Peak <span className="text-red-400 font-medium">{peakBpm}</span></span>
          <span>Low <span className="text-sky-400 font-medium">{lowBpm}</span></span>
        </div>
        <button
          onClick={nextDay}
          disabled={isToday}
          className={`text-sm px-1 cursor-pointer ${isToday ? 'text-gray-700' : 'text-gray-400 hover:text-white'}`}
        >&rarr;</button>
      </div>

      <div className="h-44 flex-1 min-h-0">
        <ResponsiveContainer>
          <LineChart data={zonedData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            {/* Zone backgrounds - strong like Fitbit */}
            <ReferenceArea y1={domainMin} y2={zones.light} fill="#7dd3fc" fillOpacity={0.1} />
            <ReferenceArea y1={zones.light} y2={zones.moderate} fill="#7dd3fc" fillOpacity={0.18} />
            <ReferenceArea y1={zones.moderate} y2={zones.vigorous} fill="#4ade80" fillOpacity={0.18} />
            <ReferenceArea y1={zones.vigorous} y2={zones.peak} fill="#facc15" fillOpacity={0.2} />
            <ReferenceArea y1={zones.peak} y2={domainMax} fill="#fca5a5" fillOpacity={0.25} />

            {/* Threshold lines */}
            <ReferenceLine y={zones.moderate} stroke="#4ade80" strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={zones.vigorous} stroke="#facc15" strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={zones.peak} stroke="#fca5a5" strokeDasharray="4 4" strokeOpacity={0.7} />

            <XAxis
              dataKey="hour"
              type="number"
              domain={[data[0].hour, data[data.length - 1].hour]}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`}
            />
            <YAxis
              domain={[domainMin, domainMax]}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              ticks={[zones.moderate, zones.vigorous, zones.peak]}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
              formatter={(value, name) => [`${value} bpm`, String(name).charAt(0).toUpperCase() + String(name).slice(1)]}
              labelFormatter={(label) => {
                const h = Number(label);
                return `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
              }}
            />
            <Line type="monotone" dataKey="light" stroke="#7dd3fc" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="moderate" stroke="#4ade80" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="vigorous" stroke="#facc15" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="peak" stroke="#fca5a5" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-center gap-3 mt-1 text-[9px] text-gray-500">
        <span><span className="inline-block w-2 h-2 rounded-full mr-0.5" style={{ backgroundColor: '#7dd3fc' }} />Light &lt;{zones.moderate}</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-0.5" style={{ backgroundColor: '#4ade80' }} />Moderate {zones.moderate}-{zones.vigorous}</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-0.5" style={{ backgroundColor: '#facc15' }} />Vigorous {zones.vigorous}-{zones.peak}</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-0.5" style={{ backgroundColor: '#fca5a5' }} />Peak &gt;{zones.peak}</span>
      </div>
    </Card>
  );
}
