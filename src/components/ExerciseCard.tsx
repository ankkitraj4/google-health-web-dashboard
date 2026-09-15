import { useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { getExercisesFromBackend, exerciseLabel, type ExerciseSession } from '../api/exercise';
import { getHeartRateRangeFromBackend, getHeartRateZonesFromBackend, type HeartRateSample } from '../api/heart-rate';
import { Card, LoadingCard, renderFetchError } from './Card';

function formatDuration(startTime: string, endTime: string): string {
  const totalSecs = Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtZoneMins(secs: number): string {
  return secs > 0 ? `${Math.round(secs / 60)}m` : '0m';
}

// -- HR Chart --

interface HrChartPoint {
  minutes: number;
  timeLabel: string;
  bpm: number;
}

interface ZoneThresholds {
  light: number;
  moderate: number;
  vigorous: number;
  peak: number;
}

const DEFAULT_ZONES: ZoneThresholds = { light: 104, moderate: 134, vigorous: 153, peak: 171 };

function HrChart({ samples, startTime, zones = DEFAULT_ZONES }: { samples: HeartRateSample[]; startTime: string; zones?: ZoneThresholds }) {
  if (samples.length === 0) return null;

  const startMs = new Date(startTime).getTime();
  const data: HrChartPoint[] = samples.map((s) => {
    const mins = (new Date(s.time).getTime() - startMs) / 60000;
    return {
      minutes: Math.round(mins * 10) / 10,
      timeLabel: `${Math.floor(mins)}:${String(Math.round((mins % 1) * 60)).padStart(2, '0')}`,
      bpm: s.bpm,
    };
  });

  const maxBpm = Math.max(...data.map((d) => d.bpm), zones.peak + 10);
  const minBpm = Math.max(40, Math.min(...data.map((d) => d.bpm)) - 5);
  const minMin = data[0].minutes;
  const maxMin = data[data.length - 1].minutes;

  const domainMin = minBpm - 5;
  const domainMax = maxBpm + 5;

  // Split data into zone-colored series
  type ZonedPoint = { minutes: number; light?: number; moderate?: number; vigorous?: number; peak?: number };
  const zonedData: ZonedPoint[] = data.map((d) => {
    const z: ZonedPoint = { minutes: d.minutes };
    if (d.bpm >= zones.peak) z.peak = d.bpm;
    else if (d.bpm >= zones.vigorous) z.vigorous = d.bpm;
    else if (d.bpm >= zones.moderate) z.moderate = d.bpm;
    else z.light = d.bpm;
    return z;
  });
  for (let i = 1; i < zonedData.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const prevZone = prev.bpm >= zones.peak ? 'peak' : prev.bpm >= zones.vigorous ? 'vigorous' : prev.bpm >= zones.moderate ? 'moderate' : 'light';
    const currZone = curr.bpm >= zones.peak ? 'peak' : curr.bpm >= zones.vigorous ? 'vigorous' : curr.bpm >= zones.moderate ? 'moderate' : 'light';
    if (prevZone !== currZone) {
      zonedData[i][prevZone as keyof Omit<ZonedPoint, 'minutes'>] = curr.bpm;
      zonedData[i - 1][currZone as keyof Omit<ZonedPoint, 'minutes'>] = prev.bpm;
    }
  }

  return (
    <div className="mt-4">
      <p className="text-xs text-gray-400 mb-2">Heart Rate</p>
      <div className="h-64">
        <ResponsiveContainer>
          <LineChart data={zonedData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <ReferenceArea y1={minBpm} y2={zones.light} fill="#7dd3fc" fillOpacity={0.1} />
            <ReferenceArea y1={zones.light} y2={zones.moderate} fill="#7dd3fc" fillOpacity={0.18} />
            <ReferenceArea y1={zones.moderate} y2={zones.vigorous} fill="#4ade80" fillOpacity={0.18} />
            <ReferenceArea y1={zones.vigorous} y2={zones.peak} fill="#facc15" fillOpacity={0.2} />
            <ReferenceArea y1={zones.peak} y2={maxBpm} fill="#fca5a5" fillOpacity={0.25} />

            <ReferenceLine y={zones.moderate} stroke="#4ade80" strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={zones.vigorous} stroke="#facc15" strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={zones.peak} stroke="#fca5a5" strokeDasharray="4 4" strokeOpacity={0.7} />

            <XAxis
              dataKey="minutes"
              type="number"
              domain={[minMin, maxMin]}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${Math.floor(v)}'`}
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
                const mins = Number(label);
                return `${Math.floor(mins)}:${String(Math.round((mins % 1) * 60)).padStart(2, '0')}`;
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
    </div>
  );
}

// -- Modal --

function ExerciseModal({ session, onClose }: { session: ExerciseSession; onClose: () => void }) {
  const duration = formatDuration(session.startTime, session.endTime);
  const dist = session.distanceMm ? (session.distanceMm / 1_000_000).toFixed(2) : null;
  const cal = session.caloriesKcal;
  const avgHr = session.avgHeartRate;
  const elevation = session.elevationGainMm ? (session.elevationGainMm / 1000).toFixed(0) : null;
  const pace = session.avgPaceSPerM != null ? session.avgPaceSPerM * 1000 : null;
  const speed = session.avgSpeedMmPerS != null ? (session.avgSpeedMmPerS / 1000) * 3.6 : null;
  const vo2 = session.vo2Max;
  const steps = session.steps;
  const azm = session.activeZoneMinutes;

  const [hrData, setHrData] = useState<HeartRateSample[]>([]);
  const [hrLoading, setHrLoading] = useState(true);
  const [hrZones, setHrZones] = useState<ZoneThresholds>(DEFAULT_ZONES);

  useEffect(() => {
    Promise.all([
      getHeartRateRangeFromBackend(session.startTime, session.endTime),
      getHeartRateZonesFromBackend(7).catch(() => null),
    ])
      .then(([samples, zones]) => {
        setHrData(samples);
        if (zones?.light && zones?.moderate && zones?.vigorous && zones?.peak) {
          setHrZones({ light: zones.light, moderate: zones.moderate, vigorous: zones.vigorous, peak: zones.peak });
        }
      })
      .catch(() => {})
      .finally(() => setHrLoading(false));
  }, [session.startTime, session.endTime]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{session.displayName || exerciseLabel(session.exerciseType)}</h3>
            <p className="text-sm text-gray-400">{exerciseLabel(session.exerciseType)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl cursor-pointer leading-none">&times;</button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
          <Stat label="Date" value={new Date(session.startTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} />
          <Stat label="Time" value={`${formatTime(session.startTime)} - ${formatTime(session.endTime)}`} />
          <Stat label="Duration" value={duration} />
          {dist && <Stat label="Distance" value={`${dist} km`} />}
          {cal != null && <Stat label="Calories" value={`${Math.round(cal)} kcal`} />}
          {avgHr != null && <Stat label="Avg HR" value={`${avgHr} bpm`} />}
          {elevation && <Stat label="Elevation" value={`${elevation} m`} />}
          {pace != null && <Stat label="Pace" value={`${Math.floor(pace / 60)}:${String(Math.round(pace % 60)).padStart(2, '0')} /km`} />}
          {speed != null && <Stat label="Speed" value={`${speed.toFixed(1)} km/h`} />}
          {steps != null && steps > 0 && <Stat label="Steps" value={steps.toLocaleString()} />}
          {azm != null && azm > 0 && <Stat label="Active Zone Min" value={String(azm)} />}
          {vo2 != null && <Stat label="VO2 max" value={vo2.toFixed(1)} />}
        </div>

        <ZoneBar zones={session.hrZoneSeconds} />

        {hrLoading ? (
          <div className="flex items-center justify-center h-20 mt-4">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
          </div>
        ) : hrData.length > 0 ? (
          <HrChart samples={hrData} startTime={session.startTime} zones={hrZones} />
        ) : null}

        {session.notes && (
          <div className="mt-3 border-t border-gray-800 pt-3">
            <p className="text-xs text-gray-400">Notes</p>
            <p className="text-sm text-gray-300 mt-1">{session.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg px-3 py-2">
      <p className="text-white font-medium text-sm">{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

function ZoneBar({ zones }: { zones: ExerciseSession['hrZoneSeconds'] }) {
  const items = [
    { label: 'Light', value: zones.light ?? 0, color: '#38bdf8' },
    { label: 'Moderate', value: zones.moderate ?? 0, color: '#f59e0b' },
    { label: 'Vigorous', value: zones.vigorous ?? 0, color: '#fb7185' },
    { label: 'Peak', value: zones.peak ?? 0, color: '#ef4444' },
  ];
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return null;

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">Heart Rate Zones</p>
      <div className="flex h-3 rounded-full overflow-hidden mb-2">
        {items.map((item) => item.value > 0 && (
          <div key={item.label} style={{ width: `${(item.value / total) * 100}%`, backgroundColor: item.color }} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400">
        {items.map((item) => (
          <span key={item.label}>
            <span style={{ color: item.color }}>{item.label}</span> {fmtZoneMins(item.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

// -- Card --

export function ExerciseCard() {
  const { isAuthenticated } = useAuth();
  const [exercises, setExercises] = useState<ExerciseSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [month, setMonth] = useState(new Date());
  const [modalExercise, setModalExercise] = useState<ExerciseSession | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    getExercisesFromBackend()
      .then(setExercises)
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const exercisesByDate = useMemo(() => {
    const map: Record<string, ExerciseSession[]> = {};
    for (const ex of exercises) {
      const d = new Date(ex.startTime);
      const key = dateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(ex);
    }
    return map;
  }, [exercises]);

  const monthStats = useMemo(() => {
    let totalExercises = 0;
    let activeDays = 0;
    const y = month.getFullYear();
    const m = month.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(new Date(y, m, d));
      const count = (exercisesByDate[key] || []).length;
      totalExercises += count;
      if (count > 0) activeDays++;
    }
    return { totalExercises, activeDays };
  }, [month, exercisesByDate]);

  const selectedKey = selectedDate ? dateKey(selectedDate) : null;
  const selectedExercises = selectedKey ? (exercisesByDate[selectedKey] || []) : [];

  const modifiers = useMemo(() => {
    const exerciseDays: Date[] = [];
    for (const key of Object.keys(exercisesByDate)) {
      const [y, m, d] = key.split('-').map(Number);
      exerciseDays.push(new Date(y, m - 1, d));
    }
    return { exercise: exerciseDays };
  }, [exercisesByDate]);

  const modifiersClassNames = useMemo(() => ({
    exercise: 'rdp-exercise-day',
  }), []);

  const handleSelect = useCallback((date: Date | undefined) => {
    setSelectedDate(date);
  }, []);

  if (loading) return <LoadingCard title="Exercises" />;
  if (error) return renderFetchError('Exercises', error);

  return (
    <>
    <Card title="Exercises" subtitle={`${monthStats.totalExercises} exercises / ${monthStats.activeDays} days`}>
      <div className="flex gap-4 flex-1 min-h-0">
        <div className="exercise-calendar exercise-calendar-compact flex-shrink-0">
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            month={month}
            onMonthChange={setMonth}
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            showOutsideDays={false}
            fixedWeeks={false}
            weekStartsOn={1}
          />
        </div>

        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
          {selectedDate ? (
            <>
              <p className="text-[11px] text-gray-400 mb-1.5">
                {selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                {' -- '}{selectedExercises.length} exercise{selectedExercises.length !== 1 ? 's' : ''}
              </p>
              {selectedExercises.length === 0 ? (
                <p className="text-gray-600 text-xs">No exercises</p>
              ) : (
                <div className="space-y-1">
                  {selectedExercises.map((session, i) => {
                    const duration = formatDuration(session.startTime, session.endTime);
                    const dist = session.distanceMm ? `${(session.distanceMm / 1_000_000).toFixed(2)} km` : null;
                    const cal = session.caloriesKcal;

                    return (
                      <button
                        key={session.sourceId || i}
                        onClick={() => setModalExercise(session)}
                        className="w-full text-left bg-gray-800/50 rounded px-2 py-1.5 hover:bg-gray-700/50 transition-colors cursor-pointer"
                      >
                        <p className="text-white text-xs font-medium truncate">{session.displayName || exerciseLabel(session.exerciseType)}</p>
                        <p className="text-gray-500 text-[10px]">
                          {formatTime(session.startTime)} · {duration}
                          {dist && ` · ${dist}`}
                          {cal != null && ` · ${Math.round(cal)} kcal`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-600 text-xs">Select a day to see exercises</p>
          )}
        </div>
      </div>
    </Card>
    {modalExercise && createPortal(
      <ExerciseModal session={modalExercise} onClose={() => setModalExercise(null)} />,
      document.body
    )}
    </>
  );
}
