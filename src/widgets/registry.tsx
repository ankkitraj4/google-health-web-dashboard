import type { ComponentType } from 'react';
import { SleepCard } from '../components/SleepCard';
import { ReadinessCard } from '../components/ReadinessCard';
import { HrvCard } from '../components/HrvCard';
import { RestingHrCard } from '../components/RestingHrCard';
import { CardioCard, HeartZonesCard } from '../components/CardioCard';
import { NutritionCard } from '../components/NutritionCard';
import { ActivityCard } from '../components/ActivityCard';
import { ExerciseCard } from '../components/ExerciseCard';
import { DailyHrCard } from '../components/DailyHrCard';

export interface WidgetDef {
  type: string;
  name: string;
  description: string;
  component: ComponentType;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
}

export const WIDGET_REGISTRY: Record<string, WidgetDef> = {
  sleep: { type: 'sleep', name: 'Sleep', description: 'Sleep stages and score', component: SleepCard, defaultW: 4, defaultH: 5, minW: 3, minH: 4 },
  readiness: { type: 'readiness', name: 'Readiness', description: 'Derived readiness score', component: ReadinessCard, defaultW: 4, defaultH: 5, minW: 3, minH: 4 },
  hrv: { type: 'hrv', name: 'HRV', description: 'Heart rate variability trend', component: HrvCard, defaultW: 4, defaultH: 5, minW: 3, minH: 3 },
  'resting-hr': { type: 'resting-hr', name: 'Resting HR', description: 'Resting heart rate trend', component: RestingHrCard, defaultW: 4, defaultH: 4, minW: 3, minH: 3 },
  cardio: { type: 'cardio', name: 'Cardio', description: 'Active zone minutes and cardio metrics', component: CardioCard, defaultW: 4, defaultH: 4, minW: 3, minH: 3 },
  'heart-zones': { type: 'heart-zones', name: 'Heart Zones', description: 'HR zone distribution and thresholds', component: HeartZonesCard, defaultW: 4, defaultH: 4, minW: 3, minH: 3 },
  nutrition: { type: 'nutrition', name: 'Nutrition', description: 'Daily macros and nutrition history', component: NutritionCard, defaultW: 4, defaultH: 5, minW: 3, minH: 4 },
  activity: { type: 'activity', name: 'Activity', description: 'Steps and calories', component: ActivityCard, defaultW: 4, defaultH: 5, minW: 3, minH: 4 },
  // Wider than the other default cards (matches daily-hr's treatment): its
  // two-pane calendar+detail-list layout gets squeezed into an unreadable
  // single-character-per-line column at the narrower defaultW:4 other cards
  // use — found and fixed while verifying M6 end to end.
  exercise: { type: 'exercise', name: 'Exercises', description: 'Exercise calendar and details', component: ExerciseCard, defaultW: 8, defaultH: 6, minW: 6, minH: 4 },
  'daily-hr': { type: 'daily-hr', name: 'Daily Heart Rate', description: 'Full-day HR graph with zones', component: DailyHrCard, defaultW: 8, defaultH: 5, minW: 4, minH: 4 },
};

export const WIDGET_TYPES = Object.keys(WIDGET_REGISTRY);
