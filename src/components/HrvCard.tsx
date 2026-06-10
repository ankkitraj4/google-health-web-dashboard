import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { getHrvData } from '../api/hrv';
import type { HrvDataPoint } from '../types/health';
import { Card, LoadingCard, ErrorCard, EmptyCard } from './Card';
import { useDateRange } from '../context/DateRangeContext';

function calcRange(values: number[]): { mean: number; low: number; high: number } {
  if (values.length === 0) return { mean: 0, low: 0, high: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  return {
    mean: Math.round(mean),
    low: Math.round(Math.max(0, mean - sd)),
    high: Math.round(mean + sd),
  };
}

export function HrvCard() {
  const { accessToken } = useAuth();
  const { daysBack } = useDateRange();
  const [data, setData] = useState<HrvDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    getHrvData(accessToken, Math.max(daysBack, 30))
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, daysBack]);

  if (loading) return <LoadingCard title="Heart Rate Variability" />;
  if (error) return <ErrorCard title="Heart Rate Variability" error={error} />;
  if (data.length === 0) return <EmptyCard title="Heart Rate Variability" />;

  const allValues = data
    .filter((d) => d.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds != null)
    .map((d) => d.dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds || 0);

  const range = calcRange(allValues);

  // Show last 7 days on chart
  const chartData = data
    .filter((d) => d.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds != null)
    .map((d) => ({
      date: `${d.dailyHeartRateVariability.date.month}/${d.dailyHeartRateVariability.date.day}`,
      rmssd: Math.round(d.dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds || 0),
    }))
    .reverse()
    .slice(-daysBack);

  const latest = chartData[chartData.length - 1]?.rmssd || 0;
  const status = latest >= range.low && latest <= range.high
    ? 'Normal'
    : latest < range.low
      ? 'Below range'
      : 'Above range';

  const statusColor = status === 'Normal' ? 'text-green-400' : status === 'Below range' ? 'text-orange-400' : 'text-blue-400';

  return (
    <Card title="Heart Rate Variability" subtitle={`Last ${daysBack} days`}>
      <div className="flex items-baseline gap-3 mb-1">
        <p className="text-3xl font-bold">{latest} <span className="text-sm font-normal text-gray-400">ms</span></p>
        <span className={`text-xs ${statusColor}`}>{status}</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">Your range: {range.low}–{range.high} ms (avg {range.mean})</p>
      <div className="h-32">
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis hide domain={[Math.min(range.low - 10, (chartData[0]?.rmssd || 0) - 10), Math.max(range.high + 10, (chartData[chartData.length - 1]?.rmssd || 0) + 10)]} />
            <ReferenceArea
              y1={range.low}
              y2={range.high}
              fill="#8b5cf6"
              fillOpacity={0.1}
              stroke="none"
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
              formatter={(value) => [`${value} ms`, 'HRV']}
            />
            <Line type="monotone" dataKey="rmssd" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
