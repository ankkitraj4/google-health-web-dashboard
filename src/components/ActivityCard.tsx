import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { getStepsDaily, getCaloriesDaily } from '../api/activity';
import type { StepsRollupDataPoint, CaloriesRollupDataPoint } from '../types/health';
import { Card, LoadingCard, ErrorCard, EmptyCard } from './Card';
import { useDateRange } from '../context/DateRangeContext';

interface DayData {
  date: string;
  steps: number;
}

interface StepsGoals {
  daily: number;
  weekly: number;
}

const GOALS_KEY = 'steps_goals';
const DEFAULT_GOALS: StepsGoals = { daily: 10000, weekly: 70000 };

function kcalValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  if (value && typeof value === 'object') {
    const parsedValue = (value as { parsedValue?: unknown }).parsedValue;
    if (typeof parsedValue === 'number') return parsedValue;
    const source = (value as { source?: unknown }).source;
    if (typeof source === 'string') return Number(source) || 0;
  }
  return 0;
}

function loadGoals(): StepsGoals {
  try {
    const stored = localStorage.getItem(GOALS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // Ignore parse errors and fall back to defaults.
  }
  return DEFAULT_GOALS;
}

function saveGoals(goals: StepsGoals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

export function ActivityCard() {
  const { accessToken } = useAuth();
  const { daysBack } = useDateRange();
  const [stepsData, setStepsData] = useState<DayData[]>([]);
  const [totalCalories, setTotalCalories] = useState(0);
  const [goals, setGoals] = useState<StepsGoals>(loadGoals);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    Promise.all([getStepsDaily(accessToken, daysBack), getCaloriesDaily(accessToken, daysBack)])
      .then(([steps, calories]) => {
        const mapped = steps.map((s: StepsRollupDataPoint) => {
          const d = s.civilStartTime?.date;
          return {
            date: d ? `${d.month}/${d.day}` : '?',
            steps: parseInt(s.steps.countSum) || 0,
          };
        });
        setStepsData(mapped.reverse());

        const calTotal = calories.reduce(
          (sum: number, c: CaloriesRollupDataPoint) => sum + (kcalValue(c.totalCalories?.kcalSum) || kcalValue(c.activeEnergyBurned?.kcalSum)),
          0
        );
        setTotalCalories(Math.round(calTotal));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, daysBack]);

  function updateGoal(key: keyof StepsGoals, value: number) {
    const updated = { ...goals, [key]: value };
    setGoals(updated);
    saveGoals(updated);
  }

  if (loading) return <LoadingCard title="Activity" />;
  if (error) return <ErrorCard title="Activity" error={error} />;
  if (stepsData.length === 0) return <EmptyCard title="Activity" />;

  const todaySteps = stepsData[stepsData.length - 1]?.steps || 0;

  // Calculate week from Monday
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekData = stepsData.slice(-1 * (daysSinceMonday + 1));
  const weeklySteps = thisWeekData.reduce((s, d) => s + d.steps, 0);
  const daysHit = thisWeekData.filter((d) => d.steps >= goals.daily).length;
  const weekDays = thisWeekData.length;
  const weeklyPct = goals.weekly > 0 ? Math.min((weeklySteps / goals.weekly) * 100, 100) : 0;

  return (
    <Card title="Activity" subtitle={`Last ${daysBack} days`}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-3xl font-bold">{todaySteps.toLocaleString()}</p>
            <p className="text-sm text-gray-400">steps today</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{totalCalories.toLocaleString()}</p>
            <p className="text-sm text-gray-400">kcal burned (7d)</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{daysHit}<span className="text-sm font-normal text-gray-400">/{weekDays} days</span></p>
            <p className="text-sm text-gray-400">goal hit</p>
          </div>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer shrink-0"
        >
          {editing ? 'Done' : 'Edit goals'}
        </button>
      </div>

      {editing && (
        <div className="flex gap-4 mb-4 text-sm">
          <label className="flex items-center gap-2 text-gray-400">
            Daily:
            <input
              type="number"
              value={goals.daily}
              onChange={(e) => updateGoal('daily', Math.max(0, parseInt(e.target.value) || 0))}
              className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-right text-white text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-gray-400">
            Weekly:
            <input
              type="number"
              value={goals.weekly}
              onChange={(e) => updateGoal('weekly', Math.max(0, parseInt(e.target.value) || 0))}
              className="w-24 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-right text-white text-sm"
            />
          </label>
        </div>
      )}

      {/* Weekly progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Weekly: {weeklySteps.toLocaleString()} / {goals.weekly.toLocaleString()}</span>
          <span className={weeklySteps >= goals.weekly ? 'text-green-400' : ''}>
            {weeklySteps >= goals.weekly ? 'Met' : `${Math.round(weeklyPct)}%`}
          </span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${weeklyPct}%`,
              backgroundColor: weeklySteps >= goals.weekly ? '#22c55e' : '#3b82f6',
            }}
          />
        </div>
      </div>

      <div className="h-36">
        <ResponsiveContainer>
          <BarChart data={stepsData}>
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              formatter={(value) => Number(value).toLocaleString()}
              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
            />
            <ReferenceLine y={goals.daily} stroke="#4b5563" strokeDasharray="4 4" />
            <Bar dataKey="steps" radius={[4, 4, 0, 0]} barSize={24}>
              {stepsData.map((entry) => (
                <Cell
                  key={entry.date}
                  fill={entry.steps >= goals.daily ? '#22c55e' : '#6b7280'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
