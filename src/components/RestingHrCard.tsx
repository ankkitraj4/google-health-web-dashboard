import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { getRestingHrFromBackend } from '../api/resting-hr';
import { Card, LoadingCard, EmptyCard, FreshnessNote, renderFetchError } from './Card';
import { useDateRange } from '../context/DateRangeContext';

export function RestingHrCard() {
  const { isAuthenticated } = useAuth();
  const { daysBack } = useDateRange();
  const [chartData, setChartData] = useState<Array<{ date: string; bpm: number }>>([]);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    getRestingHrFromBackend(daysBack)
      .then((res) => {
        setChartData(
          res.points.map((p) => {
            const [, month, day] = p.date.split('-');
            return { date: `${Number(month)}/${Number(day)}`, bpm: p.value };
          })
        );
        setLatestDate(res.latestDate);
      })
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [isAuthenticated, daysBack]);

  if (loading) return <LoadingCard title="Resting Heart Rate" />;
  if (error) return renderFetchError('Resting Heart Rate', error);
  if (chartData.length === 0) return <EmptyCard title="Resting Heart Rate" />;

  const latest = chartData[chartData.length - 1]?.bpm || 0;

  return (
    <Card title="Resting Heart Rate" subtitle={`Last ${daysBack} days`}>
      <FreshnessNote latestDate={latestDate} />
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
