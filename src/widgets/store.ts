const INSTANCES_KEY = 'dashboard_widgets_v1';

export interface WidgetInstance {
  id: string;
  type: string;
}

const DEFAULT_INSTANCES: WidgetInstance[] = [
  { id: 'sleep-1', type: 'sleep' },
  { id: 'readiness-1', type: 'readiness' },
  { id: 'hrv-1', type: 'hrv' },
  { id: 'resting-hr-1', type: 'resting-hr' },
  { id: 'cardio-1', type: 'cardio' },
  { id: 'heart-zones-1', type: 'heart-zones' },
  { id: 'nutrition-1', type: 'nutrition' },
  { id: 'activity-1', type: 'activity' },
  { id: 'exercise-1', type: 'exercise' },
  { id: 'daily-hr-1', type: 'daily-hr' },
];

export function loadInstances(): WidgetInstance[] {
  try {
    const stored = localStorage.getItem(INSTANCES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // Ignore parse errors and fall back to the default widget set.
  }
  return DEFAULT_INSTANCES;
}

export function saveInstances(instances: WidgetInstance[]) {
  localStorage.setItem(INSTANCES_KEY, JSON.stringify(instances));
}

let counter = Date.now();

export function createInstanceId(type: string): string {
  return `${type}-${++counter}`;
}

export function getDefaultInstances(): WidgetInstance[] {
  return DEFAULT_INSTANCES;
}
