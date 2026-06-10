import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { getNutritionData, getNutritionHistory } from '../api/nutrition';
import { useDateRange } from '../context/DateRangeContext';
import type { NutritionDataPoint } from '../types/health';

import { Card, LoadingCard, ErrorCard, EmptyCard } from './Card';

interface MacroSummary {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Goals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const DEFAULT_GOALS: Goals = { calories: 2000, protein: 120, carbs: 250, fat: 65 };
const GOALS_KEY = 'nutrition_goals';

function loadGoals(): Goals {
  try {
    const stored = localStorage.getItem(GOALS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return DEFAULT_GOALS;
}

function saveGoals(goals: Goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

const TOLERANCE = 0.1; // ±10%

type GoalStatus = 'under' | 'met' | 'over';

function getGoalStatus(current: number, goal: number): GoalStatus {
  if (goal === 0) return 'under';
  const ratio = current / goal;
  if (ratio < 1 - TOLERANCE) return 'under';
  if (ratio > 1 + TOLERANCE) return 'over';
  return 'met';
}

const STATUS_LABELS: Record<GoalStatus, string> = {
  under: '',
  met: 'Met',
  over: 'Over',
};

function ProgressRow({
  label,
  current,
  goal,
  unit,
  color,
  editing,
  onGoalChange,
}: {
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
  editing: boolean;
  onGoalChange: (val: number) => void;
}) {
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const status = getGoalStatus(current, goal);
  const barColor = status === 'met' ? '#22c55e' : status === 'over' ? '#f97316' : color;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="flex items-center gap-2">
          <span className="text-gray-300">{label}</span>
          {status !== 'under' && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${
                status === 'met'
                  ? 'bg-green-900/50 text-green-400'
                  : 'bg-orange-900/50 text-orange-400'
              }`}
            >
              {STATUS_LABELS[status]}
            </span>
          )}
        </span>
        <span className="text-gray-400">
          {Math.round(current)}{unit}
          {' / '}
          {editing ? (
            <input
              type="number"
              value={goal}
              onChange={(e) => onGoalChange(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-16 bg-gray-800 border border-gray-600 rounded px-1 text-right text-white text-sm"
            />
          ) : (
            <span>{goal}{unit}</span>
          )}
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

interface DayNutrition {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function aggregateByDay(points: NutritionDataPoint[], daysBack: number): DayNutrition[] {
  const byDate: Record<string, MacroSummary> = {};

  for (const d of points) {
    const time = d.nutritionLog?.interval?.startTime;
    if (!time) continue;
    const dateStr = time.split('T')[0];
    if (!byDate[dateStr]) byDate[dateStr] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const day = byDate[dateStr];
    const log = d.nutritionLog;
    day.calories += log?.energy?.kcal ?? 0;
    day.carbs += log?.totalCarbohydrate?.grams ?? 0;
    day.fat += log?.totalFat?.grams ?? 0;
    for (const n of log?.nutrients || []) {
      if (n.nutrient === 'PROTEIN') day.protein += n.quantity?.grams ?? 0;
    }
  }

  const result: DayNutrition[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const entry = byDate[iso];
    result.push({
      date: label,
      calories: Math.round(entry?.calories ?? 0),
      protein: Math.round(entry?.protein ?? 0),
      carbs: Math.round(entry?.carbs ?? 0),
      fat: Math.round(entry?.fat ?? 0),
    });
  }
  return result;
}

interface FoodEntry {
  name: string;
  mealType: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving?: string;
  time?: string;
}

function parseMealType(type?: string): string {
  if (!type) return 'Other';
  const map: Record<string, string> = {
    MEAL_TYPE_BREAKFAST: 'Breakfast',
    MEAL_TYPE_LUNCH: 'Lunch',
    MEAL_TYPE_DINNER: 'Dinner',
    MEAL_TYPE_SNACK: 'Snack',
    MEAL_TYPE_DRINK: 'Drink',
    BREAKFAST: 'Breakfast',
    LUNCH: 'Lunch',
    DINNER: 'Dinner',
    SNACK: 'Snack',
  };
  return map[type] || type.replace(/MEAL_TYPE_/g, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseFoodEntries(data: NutritionDataPoint[]): FoodEntry[] {
  return data.map((d) => {
    const log = d.nutritionLog;
    let protein = 0;
    for (const n of log?.nutrients || []) {
      if (n.nutrient === 'PROTEIN') protein += n.quantity?.grams ?? 0;
    }
    const serving = log?.serving
      ? `${log.serving.amount}${log.serving.foodMeasurementUnitDisplayName ? ' ' + log.serving.foodMeasurementUnitDisplayName : ''}`
      : undefined;
    const time = log?.interval?.startTime
      ? new Date(log.interval.startTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : undefined;
    return {
      name: log?.foodDisplayName || 'Unknown food',
      mealType: parseMealType(log?.mealType),
      calories: Math.round(log?.energy?.kcal ?? 0),
      protein: Math.round(protein),
      carbs: Math.round(log?.totalCarbohydrate?.grams ?? 0),
      fat: Math.round(log?.totalFat?.grams ?? 0),
      serving,
      time,
    };
  }).sort((a, b) => {
    const order = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink', 'Other'];
    return order.indexOf(a.mealType) - order.indexOf(b.mealType);
  });
}

const MEAL_COLORS: Record<string, string> = {
  Breakfast: '#f59e0b',
  Lunch: '#22c55e',
  Dinner: '#3b82f6',
  Snack: '#a78bfa',
  Drink: '#38bdf8',
  Other: '#6b7280',
};

type NutritionView = 'today' | 'foods' | 'history';

export function NutritionCard() {
  const { accessToken } = useAuth();
  const { daysBack } = useDateRange();
  const [macros, setMacros] = useState<MacroSummary | null>(null);
  const [foods, setFoods] = useState<FoodEntry[]>([]);
  const [history, setHistory] = useState<DayNutrition[]>([]);
  const [goals, setGoals] = useState<Goals>(loadGoals);
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<NutritionView>('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    Promise.all([
      getNutritionData(accessToken),
      getNutritionHistory(accessToken, daysBack),
    ])
      .then(([todayData, historyData]) => {
        const summary: MacroSummary = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        for (const d of todayData) {
          const log = d.nutritionLog;
          summary.calories += log?.energy?.kcal ?? 0;
          summary.carbs += log?.totalCarbohydrate?.grams ?? 0;
          summary.fat += log?.totalFat?.grams ?? 0;
          for (const n of log?.nutrients || []) {
            if (n.nutrient === 'PROTEIN') summary.protein += n.quantity?.grams ?? 0;
          }
        }
        setMacros(summary);
        setFoods(parseFoodEntries(todayData));
        setHistory(aggregateByDay(historyData, daysBack));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, daysBack]);

  function updateGoal(key: keyof Goals, value: number) {
    const updated = { ...goals, [key]: value };
    setGoals(updated);
    saveGoals(updated);
  }

  if (loading) return <LoadingCard title="Nutrition" />;
  if (error) return <ErrorCard title="Nutrition" error={error} />;
  if (!macros || (macros.calories === 0 && history.every((d) => d.calories === 0))) return <EmptyCard title="Nutrition" />;

  const daysWithData = history.filter((d) => d.calories > 0);
  const daysMetCalories = daysWithData.filter((d) => getGoalStatus(d.calories, goals.calories) === 'met').length;
  const daysMetProtein = daysWithData.filter((d) => getGoalStatus(d.protein, goals.protein) === 'met').length;

  return (
    <Card title="Nutrition" subtitle={view === 'today' ? 'Today' : view === 'foods' ? 'Food Log' : `Last ${daysBack} days`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex bg-gray-800 rounded-lg p-0.5 text-xs">
          {(['today', 'foods', 'history'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer capitalize ${
                view === v ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
        >
          {editing ? 'Done' : 'Edit goals'}
        </button>
      </div>

      {view === 'today' ? (
        <>
          <p className="text-3xl font-bold mb-3">
            {Math.round(macros.calories)} <span className="text-sm font-normal text-gray-400">kcal</span>
          </p>
          <div className="space-y-2">
            <ProgressRow label="Calories" current={macros.calories} goal={goals.calories} unit=" kcal" color="#f59e0b" editing={editing} onGoalChange={(v) => updateGoal('calories', v)} />
            <ProgressRow label="Protein" current={macros.protein} goal={goals.protein} unit="g" color="#22c55e" editing={editing} onGoalChange={(v) => updateGoal('protein', v)} />
            <ProgressRow label="Carbs" current={macros.carbs} goal={goals.carbs} unit="g" color="#3b82f6" editing={editing} onGoalChange={(v) => updateGoal('carbs', v)} />
            <ProgressRow label="Fat" current={macros.fat} goal={goals.fat} unit="g" color="#ef4444" editing={editing} onGoalChange={(v) => updateGoal('fat', v)} />
          </div>
        </>
      ) : view === 'foods' ? (
        <>
          {foods.length === 0 ? (
            <p className="text-gray-500 text-sm">No food entries logged today</p>
          ) : (
            <div className="space-y-1 flex-1 min-h-0 overflow-y-auto">
              {(() => {
                let lastMeal = '';
                return foods.map((food, i) => {
                  const showHeader = food.mealType !== lastMeal;
                  lastMeal = food.mealType;
                  const mealColor = MEAL_COLORS[food.mealType] || MEAL_COLORS.Other;
                  return (
                    <div key={i}>
                      {showHeader && (
                        <p className="text-[11px] font-semibold mt-2 mb-1 first:mt-0" style={{ color: mealColor }}>
                          {food.mealType}
                        </p>
                      )}
                      <div className="bg-gray-800/50 rounded-lg px-3 py-2">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white truncate">{food.name}</p>
                            {food.serving && <p className="text-[10px] text-gray-500">{food.serving}</p>}
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="text-sm font-medium text-white">{food.calories} <span className="text-[10px] text-gray-400">kcal</span></p>
                            {food.time && <p className="text-[10px] text-gray-500">{food.time}</p>}
                          </div>
                        </div>
                        <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                          <span>P <span className="text-green-400">{food.protein}g</span></span>
                          <span>C <span className="text-blue-400">{food.carbs}g</span></span>
                          <span>F <span className="text-red-400">{food.fat}g</span></span>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="h-28 mb-2">
            <ResponsiveContainer>
              <BarChart data={history}>
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                  formatter={(value, name) => {
                    const unit = String(name) === 'calories' ? ' kcal' : 'g';
                    return [`${value}${unit}`, String(name).charAt(0).toUpperCase() + String(name).slice(1)];
                  }}
                />
                <ReferenceLine y={goals.calories} stroke="#4b5563" strokeDasharray="4 4" />
                <Bar dataKey="calories" radius={[4, 4, 0, 0]} barSize={20}>
                  {history.map((d) => {
                    const status = getGoalStatus(d.calories, goals.calories);
                    return (
                      <Cell
                        key={d.date}
                        fill={d.calories === 0 ? '#1f2937' : status === 'met' ? '#22c55e' : status === 'over' ? '#f97316' : '#f59e0b'}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex justify-between text-[11px] text-gray-400 px-1">
            <span>Cal met: <span className="text-white">{daysMetCalories}/{daysWithData.length}</span></span>
            <span>Pro met: <span className="text-white">{daysMetProtein}/{daysWithData.length}</span></span>
            <span>Avg: <span className="text-white">{daysWithData.length > 0 ? Math.round(daysWithData.reduce((s, d) => s + d.calories, 0) / daysWithData.length) : 0}</span> kcal</span>
            <span><span className="text-white">{daysWithData.length > 0 ? Math.round(daysWithData.reduce((s, d) => s + d.protein, 0) / daysWithData.length) : 0}g</span> pro</span>
          </div>

          {editing && (
            <div className="mt-2 space-y-1.5">
              <ProgressRow label="Calories" current={0} goal={goals.calories} unit=" kcal" color="#f59e0b" editing={true} onGoalChange={(v) => updateGoal('calories', v)} />
              <ProgressRow label="Protein" current={0} goal={goals.protein} unit="g" color="#22c55e" editing={true} onGoalChange={(v) => updateGoal('protein', v)} />
              <ProgressRow label="Carbs" current={0} goal={goals.carbs} unit="g" color="#3b82f6" editing={true} onGoalChange={(v) => updateGoal('carbs', v)} />
              <ProgressRow label="Fat" current={0} goal={goals.fat} unit="g" color="#ef4444" editing={true} onGoalChange={(v) => updateGoal('fat', v)} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
