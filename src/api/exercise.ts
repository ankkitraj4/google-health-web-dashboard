import { healthFetch } from './client';

export const EXERCISE_TYPES = [
  'RUNNING',
  'WALKING',
  'BIKING',
  'SWIMMING',
  'HIKING',
  'YOGA',
  'PILATES',
  'WORKOUT',
  'HIIT',
  'WEIGHTLIFTING',
  'STRENGTH_TRAINING',
  'OTHER',
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export interface HeartRateZoneDurations {
  lightTime?: string;
  moderateTime?: string;
  vigorousTime?: string;
  peakTime?: string;
}

export interface ExerciseMetricsSummary {
  caloriesKcal?: number;
  distanceMillimeters?: number | string;
  steps?: string;
  averageSpeedMillimetersPerSecond?: number;
  averagePaceSecondsPerMeter?: number;
  averageHeartRateBeatsPerMinute?: string;
  elevationGainMillimeters?: number;
  activeZoneMinutes?: string;
  runVo2Max?: number;
  heartRateZoneDurations?: HeartRateZoneDurations;
  // Legacy field name
  caloriesBurned?: number;
  timeInHeartRateZones?: unknown;
}

export interface ExerciseDataPoint {
  name?: string;
  exercise: {
    interval: {
      startTime: string;
      endTime: string;
      startUtcOffset?: string;
      endUtcOffset?: string;
    };
    exerciseType: ExerciseType;
    displayName: string;
    activeDuration?: string;
    notes?: string;
    metricsSummary?: ExerciseMetricsSummary;
    createTime?: string;
    updateTime?: string;
  };
}

interface ListExerciseResponse {
  dataPoints: ExerciseDataPoint[];
  nextPageToken?: string;
}

export async function listExercises(
  accessToken: string,
  daysBack: number = 60
): Promise<ExerciseDataPoint[]> {
  const data = await healthFetch<ListExerciseResponse>(
    `/users/me/dataTypes/exercise/dataPoints?page_size=100`,
    accessToken
  );

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  return (data.dataPoints || []).filter((d) => {
    const start = d.exercise?.interval?.startTime;
    return start && new Date(start) >= cutoff;
  });
}

export interface HeartRateSample {
  time: string;
  bpm: number;
}

interface HrListResponse {
  dataPoints: Array<{ heartRate?: { sampleTime?: { physicalTime?: string }; beatsPerMinute?: string } }>;
  nextPageToken?: string;
}

export async function getExerciseHeartRate(
  accessToken: string,
  startTime: string,
  endTime: string
): Promise<HeartRateSample[]> {
  const filter = `heart_rate.sample_time.physical_time >= "${startTime}" AND heart_rate.sample_time.physical_time < "${endTime}"`;
  const allSamples: HeartRateSample[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ filter, page_size: '10000' });
    if (pageToken) params.set('page_token', pageToken);

    const data = await healthFetch<HrListResponse>(
      `/users/me/dataTypes/heart-rate/dataPoints?${params}`,
      accessToken
    );

    for (const d of data.dataPoints || []) {
      if (d.heartRate?.sampleTime?.physicalTime && d.heartRate?.beatsPerMinute) {
        allSamples.push({
          time: d.heartRate.sampleTime.physicalTime,
          bpm: parseInt(d.heartRate.beatsPerMinute, 10),
        });
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return allSamples.sort((a, b) => a.time.localeCompare(b.time));
}

export async function createExercise(
  accessToken: string,
  exercise: {
    exerciseType: ExerciseType;
    displayName: string;
    startTime: string;
    endTime: string;
    notes?: string;
  }
): Promise<unknown> {
  const utcOffset = `${new Date().getTimezoneOffset() * -60}s`;

  const body = {
    exercise: {
      interval: {
        startTime: exercise.startTime,
        endTime: exercise.endTime,
        startUtcOffset: utcOffset,
        endUtcOffset: utcOffset,
      },
      exerciseType: exercise.exerciseType,
      displayName: exercise.displayName,
      metricsSummary: {},
      ...(exercise.notes ? { notes: exercise.notes } : {}),
    },
  };

  return healthFetch(
    '/users/me/dataTypes/exercise/dataPoints',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
}
