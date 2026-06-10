import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { getHrvData } from '../api/hrv';
import { getRestingHrData } from '../api/resting-hr';
import { getSleepData } from '../api/sleep';

import { Card, LoadingCard, ErrorCard } from './Card';
import { useDateRange } from '../context/DateRangeContext';
import { calcSleepScore } from '../utils/sleep-score';

interface DayReadiness {
  date: string;
  score: number;
  hrvScore: number;
  rhrScore: number;
  sleepScore: number;
  hrv: number;
  rhr: number;
  sleepMins: number;
}

function dateKey(_y: number, m: number, d: number): string {
  return `${m}/${d}`;
}

function calcReadiness(
  hrv: number,
  hrvBaseline: number,
  rhr: number,
  rhrBaseline: number,
  sleepScoreVal: number
): { score: number; hrvScore: number; rhrScore: number; sleepScore: number } {
  // HRV score (40% weight): higher is better, compare to baseline
  // At baseline (ratio=1.0) → 62 (normal day)
  let hrvScore = 50;
  if (hrvBaseline > 0) {
    const ratio = hrv / hrvBaseline;
    if (ratio >= 1.0) {
      hrvScore = 62 + Math.min(38, (ratio - 1.0) * 76); // at baseline: 62, 1.5x: 100
    } else if (ratio >= 0.8) {
      hrvScore = 30 + (ratio - 0.8) * 160; // 80-100% of baseline: 30-62
    } else if (ratio >= 0.6) {
      hrvScore = 10 + (ratio - 0.6) * 100; // 60-80% of baseline: 10-30
    } else {
      hrvScore = Math.max(3, ratio * 17); // below 60%: 3-10
    }
  }

  // RHR score (30% weight): lower is better, compare to baseline
  // At baseline (ratio=1.0) → 62 (normal day)
  let rhrScore = 50;
  if (rhrBaseline > 0) {
    const ratio = rhrBaseline / rhr; // >1 means lower than baseline (good)
    if (ratio >= 1.0) {
      rhrScore = 62 + Math.min(38, (ratio - 1.0) * 127); // at baseline: 62, much lower: 100
    } else if (ratio >= 0.9) {
      rhrScore = 30 + (ratio - 0.9) * 320; // 0-10% above baseline: 30-62
    } else if (ratio >= 0.8) {
      rhrScore = 10 + (ratio - 0.8) * 200; // 10-20% above: 10-30
    } else {
      rhrScore = Math.max(3, ratio * 12.5); // 20%+ above: 3-10
    }
  }

  // Sleep score (30% weight): use calibrated sleep score directly
  const sleepScore = sleepScoreVal;

  const score = Math.round(hrvScore * 0.4 + rhrScore * 0.3 + sleepScore * 0.3);
  return {
    score: Math.min(100, Math.max(0, score)),
    hrvScore: Math.round(hrvScore),
    rhrScore: Math.round(rhrScore),
    sleepScore: Math.round(sleepScore),
  };
}

function getScoreColor(score: number): string {
  if (score >= 65) return '#22c55e'; // green - High
  if (score >= 30) return '#f59e0b'; // amber - Middle
  return '#ef4444'; // red - Low
}

function getScoreLabel(score: number): string {
  if (score >= 65) return 'High';
  if (score >= 30) return 'Middle';
  return 'Low';
}

export function ReadinessCard() {
  const { accessToken } = useAuth();
  const { daysBack } = useDateRange();
  const [days, setDays] = useState<DayReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    Promise.all([
      getHrvData(accessToken, Math.max(daysBack, 30)),
      getRestingHrData(accessToken, daysBack),
      getSleepData(accessToken, daysBack),
    ])
      .then(([hrvData, rhrData, sleepData]) => {
        // Build maps by date
        const hrvByDate: Record<string, number> = {};
        const allHrvValues: number[] = [];
        for (const d of hrvData) {
          const hrv = d.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds;
          if (hrv != null) {
            const dt = d.dailyHeartRateVariability.date;
            hrvByDate[dateKey(dt.year, dt.month, dt.day)] = hrv;
            allHrvValues.push(hrv);
          }
        }
        const hrvBaseline = allHrvValues.length > 0
          ? allHrvValues.reduce((a, b) => a + b, 0) / allHrvValues.length
          : 0;

        const rhrByDate: Record<string, number> = {};
        const allRhrValues: number[] = [];
        for (const d of rhrData) {
          const bpm = parseInt(d.dailyRestingHeartRate?.beatsPerMinute || '0');
          if (bpm > 0) {
            const dt = d.dailyRestingHeartRate.date;
            rhrByDate[dateKey(dt.year, dt.month, dt.day)] = bpm;
            allRhrValues.push(bpm);
          }
        }
        const rhrBaseline = allRhrValues.length > 0
          ? allRhrValues.reduce((a, b) => a + b, 0) / allRhrValues.length
          : 0;

        const sleepByDate: Record<string, { mins: number; score: number }> = {};
        for (const d of sleepData) {
          const stages = d.sleep.summary?.stagesSummary || [];
          const get = (type: string) => parseInt(stages.find((s) => s.type === type)?.minutes || '0');
          const deep = get('DEEP');
          const rem = get('REM');
          const light = get('LIGHT');
          const awake = get('AWAKE');
          const mins = parseInt(d.sleep.summary?.minutesAsleep || '0');
          if (mins >= 120) {
            const endTime = d.sleep.interval?.endTime;
            if (endTime) {
              const dt = new Date(endTime);
              const score = calcSleepScore(deep, rem, light, awake);
              sleepByDate[dateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())] = { mins, score };
            }
          }
        }

        // Build readiness for last 7 days
        const result: DayReadiness[] = [];
        for (let i = daysBack - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
          const hrv = hrvByDate[key] || 0;
          const rhr = rhrByDate[key] || 0;
          const sleepEntry = sleepByDate[key];
          const sleepMins = sleepEntry?.mins || 0;
          const sleepScoreVal = sleepEntry?.score || 0;

          if (hrv === 0 && rhr === 0 && sleepMins === 0) continue;

          const scores = calcReadiness(
            hrv || hrvBaseline,
            hrvBaseline,
            rhr || rhrBaseline,
            rhrBaseline,
            sleepScoreVal || 75
          );

          result.push({
            date: `${d.getMonth() + 1}/${d.getDate()}`,
            ...scores,
            hrv: Math.round(hrv),
            rhr,
            sleepMins,
          });
        }

        setDays(result);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, daysBack]);

  if (loading) return <LoadingCard title="Readiness" />;
  if (error) return <ErrorCard title="Readiness" error={error} />;
  if (days.length === 0) return <Card title="Readiness"><p className="text-gray-500 text-sm">No data</p></Card>;

  const today = days[days.length - 1];
  const weekAvg = Math.round(days.reduce((s, d) => s + d.score, 0) / days.length);

  return (
    <div>
    <Card title="Readiness" subtitle={`Last ${daysBack} days`}>
      {/* Today's readiness - hero */}
      <div className="flex items-center gap-5 mb-5">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center border-4"
          style={{ borderColor: getScoreColor(today.score) }}
        >
          <span className="text-3xl font-bold" style={{ color: getScoreColor(today.score) }}>
            {today.score}
          </span>
        </div>
        <div>
          <p className="text-lg font-semibold" style={{ color: getScoreColor(today.score) }}>
            {getScoreLabel(today.score)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Week avg: {weekAvg}</p>
          <div className="flex gap-3 mt-2 text-[11px] text-gray-400">
            <span>HRV {today.hrvScore}%</span>
            <span>RHR {today.rhrScore}%</span>
            <span>Sleep {today.sleepScore}%</span>
          </div>
        </div>
      </div>

      {/* Contributing factors */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-purple-400">{today.hrv}</p>
          <p className="text-[10px] text-gray-500">HRV (ms)</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-red-400">{today.rhr}</p>
          <p className="text-[10px] text-gray-500">RHR (bpm)</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-blue-400">
            {Math.floor(today.sleepMins / 60)}:{String(today.sleepMins % 60).padStart(2, '0')}
          </p>
          <p className="text-[10px] text-gray-500">Sleep</p>
        </div>
      </div>

      {/* 7-day readiness trend */}
      <div className="h-28">
        <ResponsiveContainer>
          <BarChart data={days} barSize={28}>
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
              formatter={(value, name) => {
                if (name === 'score') return [`${value}/100`, 'Readiness'];
                return [value, name];
              }}
              labelFormatter={(label) => `${label}`}
            />
            <Bar dataKey="score" radius={[4, 4, 0, 0]}>
              {days.map((d) => (
                <Cell key={d.date} fill={getScoreColor(d.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
    </div>
  );
}
