import { UnavailableCard } from './Card';

// Derived from HRV, sleep, and resting heart rate — HRV is an advanced-vitals
// metric outside the plan's declared v1 scope, so this score can't be
// computed. Per milestone M6 the frontend never talks to Google directly,
// so this shows an honest disabled state instead of a dead direct-to-Google
// fetch.
export function ReadinessCard() {
  return <UnavailableCard title="Readiness" reason="Depends on HRV, which isn't wired up yet." />;
}
