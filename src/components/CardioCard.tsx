import { UnavailableCard } from './Card';

// Active zone minutes, time-in-zone, and VO2 max aren't in the plan's
// declared v1 metric list (activity, sleep, heart rate, exercise — see
// plan/plan.md's Decisions). Neither is wired through the backend, and per
// milestone M6 the frontend never talks to Google directly, so these cards
// show an honest disabled state instead of a dead direct-to-Google fetch.
export function CardioCard() {
  return <UnavailableCard title="Cardio" reason="Active zone minutes and VO2 max aren't wired up yet." />;
}

export function HeartZonesCard() {
  return <UnavailableCard title="Heart Zones" reason="HR zone distribution isn't wired up yet." />;
}
