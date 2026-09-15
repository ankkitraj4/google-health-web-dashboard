import { UnavailableCard } from './Card';

// Nutrition isn't in the plan's declared v1 metric list (activity, sleep,
// heart rate, exercise — see plan/plan.md's Decisions). It isn't wired
// through the backend, and per milestone M6 the frontend never talks to
// Google directly, so this card shows an honest disabled state instead of a
// dead direct-to-Google fetch.
export function NutritionCard() {
  return <UnavailableCard title="Nutrition" reason="Nutrition metrics aren't wired up yet." />;
}
