import { UnavailableCard } from './Card';

// HRV is an advanced-vitals metric outside the plan's declared v1 scope
// (activity, sleep, heart rate, exercise — see plan/plan.md's Decisions).
// It isn't wired through the backend, and per milestone M6 the frontend
// never talks to Google directly, so this card shows an honest disabled
// state instead of a dead direct-to-Google fetch.
export function HrvCard() {
  return <UnavailableCard title="Heart Rate Variability" reason="Advanced vitals aren't wired up yet." />;
}
