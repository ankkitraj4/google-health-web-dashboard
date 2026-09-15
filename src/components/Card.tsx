import type { ReactNode } from 'react';

interface CardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function Card({ title, subtitle, children }: CardProps) {
  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 h-full overflow-auto flex flex-col">
      <div className="dashboard-card-handle mb-4 cursor-move select-none flex-shrink-0">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex flex-col flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}

export function LoadingCard({ title }: { title: string }) {
  return (
    <Card title={title}>
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
      </div>
    </Card>
  );
}

export function ErrorCard({ title, error }: { title: string; error: string }) {
  return (
    <Card title={title}>
      <p className="text-red-400 text-sm">{error}</p>
    </Card>
  );
}

export function EmptyCard({ title }: { title: string }) {
  return (
    <Card title={title}>
      <p className="text-gray-500 text-sm">No data available</p>
    </Card>
  );
}

export function UnavailableCard({ title, reason }: { title: string; reason: string }) {
  return (
    <Card title={title}>
      <p className="text-gray-500 text-sm">Not available in this build</p>
      <p className="text-gray-600 text-xs mt-1">{reason}</p>
    </Card>
  );
}
