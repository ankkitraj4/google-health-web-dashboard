import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { getSleepFromBackend, type BackendSleepNight } from '../api/sleep';
import { Card, LoadingCard, ErrorCard, EmptyCard } from './Card';
import { calcSleepScore } from '../utils/sleep-score';
import { useDateRange } from '../context/DateRangeContext';

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatMinutesShort(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}:${String(m).padStart(2, '0')}`;
}

const STAGE_COLORS: Record<string, string> = {
  DEEP: '#1e40af',
  REM: '#06b6d4',
  LIGHT: '#7dd3fc',
  AWAKE: '#ef4444',
};

interface NightData {
  date: string;
  total: number;
  deep: number;
  light: number;
  rem: number;
  awake: number;
  score: number;
}


function parseNight(night: BackendSleepNight): NightData {
  const deep = night.stageMinutes.DEEP ?? 0;
  const rem = night.stageMinutes.REM ?? 0;
  const light = night.stageMinutes.LIGHT ?? 0;
  const awake = night.stageMinutes.AWAKE ?? 0;
  const total = night.minutesAsleep;

  const d = new Date(night.endTime);
  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;

  return { date: dateStr, total, deep, light, rem, awake, score: calcSleepScore(deep, rem, light, awake) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SleepTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as NightData;
  return (
    <div className="bg-gray-800 rounded-lg px-3 py-2 text-sm border border-gray-700">
      <p className="text-white font-medium mb-1">{label} — {formatMinutes(data.total)} · Score: {data.score}</p>
      {['Deep', 'REM', 'Light', 'Awake'].map((stage) => {
        const key = stage.toLowerCase() as keyof NightData;
        const val = data[key] as number;
        return (
          <div key={stage} className="flex items-center gap-2 text-gray-300">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage.toUpperCase()] || STAGE_COLORS.REM }} />
            {stage}: {formatMinutes(val)}
          </div>
        );
      })}
    </div>
  );
}

export function SleepCard() {
  const { isAuthenticated } = useAuth();
  const [nights, setNights] = useState<NightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const { daysBack } = useDateRange();

  useEffect(() => {
    if (!isAuthenticated) return;
    // Reset state for a new fetch; this whole fetch-effect pattern moves to
    // backend-driven data in plan milestone M6.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getSleepFromBackend(daysBack)
      .then((data) => {
        // Backend already returns nights oldest-first (see normalizeSleep).
        const parsed = data
          .filter((n) => Object.keys(n.stageMinutes).length > 0)
          .map(parseNight)
          .filter((n) => n.total >= 120); // exclude naps
        setNights(parsed);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isAuthenticated, daysBack]);

  if (loading) return <LoadingCard title="Sleep" />;
  if (error) return <ErrorCard title="Sleep" error={error} />;
  if (nights.length === 0) return <EmptyCard title="Sleep" />;

  const lastNight = nights[nights.length - 1];
  const avgTotal = Math.round(nights.reduce((s, n) => s + n.total, 0) / nights.length);
  const avgScore = Math.round(nights.reduce((s, n) => s + n.score, 0) / nights.length);

  function handleLegendClick(e: { value?: string }) {
    const stage = e.value?.toLowerCase();
    if (!stage) return;
    setActiveStage(activeStage === stage ? null : stage);
  }

  // When a stage is selected, show only that stage (not stacked)
  const chartData = activeStage
    ? nights.map((n) => ({ ...n, _solo: n[activeStage as keyof NightData] as number }))
    : nights;

  return (
    <div className="md:col-span-2">
      <Card title="Sleep" subtitle={`Last ${daysBack} days`}>
        {/* Summary stats - single row */}
        <div className="flex items-baseline gap-4 mb-4 overflow-x-auto">
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="text-2xl font-bold">{lastNight.score}</span>
            <span className="text-xs text-gray-500">score</span>
          </div>
          <span className="text-gray-700">|</span>
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="text-2xl font-bold">{formatMinutes(lastNight.total)}</span>
            <span className="text-xs text-gray-500">last night</span>
          </div>
          <span className="text-gray-700">|</span>
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="text-2xl font-bold">{formatMinutes(avgTotal)}</span>
            <span className="text-xs text-gray-500">avg</span>
          </div>
          <span className="text-gray-700">|</span>
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="text-2xl font-bold">{avgScore}</span>
            <span className="text-xs text-gray-500">avg score</span>
          </div>
          <span className="text-gray-700">|</span>
          <div className="flex gap-3 shrink-0">
            {['DEEP', 'REM', 'LIGHT', 'AWAKE'].map((stage) => (
              <div key={stage} className="flex items-center gap-1 text-[11px] text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} />
                {formatMinutes(lastNight[stage.toLowerCase() as keyof NightData] as number)}
              </div>
            ))}
          </div>
        </div>

        {/* 7-day bar chart */}
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={chartData} barSize={48}>
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatMinutes(v)}
                width={50}
              />
              <Tooltip content={<SleepTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '12px', color: '#9ca3af', cursor: 'pointer' }}
                onClick={handleLegendClick}
                formatter={(value: string) => (
                  <span style={{
                    color: activeStage && activeStage !== value.toLowerCase() ? '#4b5563' : '#9ca3af',
                    fontWeight: activeStage === value.toLowerCase() ? 'bold' : 'normal',
                  }}>
                    {value}
                  </span>
                )}
              />
              {activeStage ? (
                <Bar
                  dataKey="_solo"
                  name={activeStage.charAt(0).toUpperCase() + activeStage.slice(1)}
                  fill={STAGE_COLORS[activeStage.toUpperCase()]}
                  radius={[4, 4, 0, 0]}
                >
                  <LabelList
                    dataKey="_solo"
                    position="top"
                    formatter={(v) => formatMinutesShort(Number(v))}
                    style={{ fill: '#9ca3af', fontSize: 10 }}
                  />
                </Bar>
              ) : (
                <>
                  <Bar dataKey="deep" stackId="sleep" name="Deep" fill={STAGE_COLORS.DEEP} />
                  <Bar dataKey="rem" stackId="sleep" name="REM" fill={STAGE_COLORS.REM} />
                  <Bar dataKey="light" stackId="sleep" name="Light" fill={STAGE_COLORS.LIGHT} />
                  <Bar dataKey="awake" stackId="sleep" name="Awake" fill={STAGE_COLORS.AWAKE} radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="total"
                      position="top"
                      formatter={(v) => formatMinutesShort(Number(v))}
                      style={{ fill: '#9ca3af', fontSize: 10 }}
                    />
                  </Bar>
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>


      </Card>
    </div>
  );
}
