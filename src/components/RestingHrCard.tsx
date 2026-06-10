import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { getRestingHrData } from '../api/resting-hr';
import type { RestingHrDataPoint } from '../types/health';
import { Card, LoadingCard, ErrorCard, EmptyCard } from './Card';
import { useDateRange } from '../context/DateRangeContext';

export function RestingHrCard() {
  const { accessToken } = useAuth();
  const { daysBack } = useDateRange();
  const [data, setData] = useState<RestingHrDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    getRestingHrData(accessToken, daysBack)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, daysBack]);

  if (loading) return <LoadingCard title="Resting Heart Rate" />;
  if (error) return <ErrorCard title="Resting Heart Rate" error={error} />;
  if (data.length === 0) return <EmptyCard title="Resting Heart Rate" />;

  const chartData = data
    .map((d) => ({
      date: `${d.dailyRestingHeartRate.date.month}/${d.dailyRestingHeartRate.date.day}`,
      bpm: parseInt(d.dailyRestingHeartRate.beatsPerMinute || '0'),
    }))
    .reverse();

  const latest = chartData[chartData.length - 1]?.bpm || 0;

  return (
    <Card title="Resting Heart Rate" subtitle={`Last ${daysBack} days`}>
      <p className="text-3xl font-bold mb-4">{latest} <span className="text-sm font-normal text-gray-400">bpm</span></p>
      <div className="h-32">
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis hide domain={['dataMin - 3', 'dataMax + 3']} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
            />
            <Line type="monotone" dataKey="bpm" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
