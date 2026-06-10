// Sleep types
export interface SleepStage {
  startTime: string;
  endTime: string;
  type: 'AWAKE' | 'LIGHT' | 'DEEP' | 'REM';
}

export interface SleepSummary {
  minutesInSleepPeriod: string;
  minutesAsleep: string;
  minutesAwake: string;
  stagesSummary?: Array<{
    type: string;
    minutes: string;
    count: string;
  }>;
}

export interface SleepDataPoint {
  name: string;
  dataSource: DataSource;
  sleep: {
    interval: TimeInterval;
    type: string;
    stages?: SleepStage[];
    summary?: SleepSummary;
  };
}

// HRV types
export interface HrvDataPoint {
  name: string;
  dataSource: DataSource;
  dailyHeartRateVariability: {
    date: CivilDate;
    averageHeartRateVariabilityMilliseconds?: number;
    nonRemHeartRateBeatsPerMinute?: string;
    entropy?: number;
    deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds?: number;
  };
}

// Resting Heart Rate types
export interface RestingHrDataPoint {
  name: string;
  dataSource: DataSource;
  dailyRestingHeartRate: {
    date: CivilDate;
    beatsPerMinute: string;
  };
}

// Nutrition types
export interface NutrientEntry {
  quantity: { grams?: number; kcal?: number };
  nutrient?: string;
}

export interface NutritionDataPoint {
  name: string;
  dataSource: DataSource;
  nutritionLog: {
    interval?: TimeInterval;
    energy?: { kcal: number; userProvidedUnit?: string };
    totalCarbohydrate?: { grams: number };
    totalFat?: { grams: number };
    nutrients?: NutrientEntry[];
    mealType?: string;
    foodDisplayName?: string;
    serving?: { amount: number; foodMeasurementUnitDisplayName?: string };
  };
}

// Activity types
export interface StepsRollupDataPoint {
  civilStartTime?: CivilDateTime;
  civilEndTime?: CivilDateTime;
  startTime?: string;
  endTime?: string;
  steps: {
    countSum: string;
  };
}

export interface CaloriesRollupDataPoint {
  civilStartTime?: CivilDateTime;
  civilEndTime?: CivilDateTime;
  startTime?: string;
  endTime?: string;
  activeEnergyBurned?: {
    kcalSum: number;
  };
  totalCalories?: {
    kcalSum: number;
  };
}

// Cardio / heart zone types
export interface ActiveZoneMinutesRollupDataPoint {
  civilStartTime?: CivilDateTime;
  civilEndTime?: CivilDateTime;
  startTime?: string;
  endTime?: string;
  activeZoneMinutes?: {
    sumInCardioHeartZone?: string;
    sumInPeakHeartZone?: string;
    sumInFatBurnHeartZone?: string;
  };
}

export interface TimeInHeartRateZoneValue {
  heartRateZone: 'HEART_RATE_ZONE_TYPE_UNSPECIFIED' | 'LIGHT' | 'MODERATE' | 'VIGOROUS' | 'PEAK';
  duration?: string;
}

export interface TimeInHeartRateZoneRollupDataPoint {
  civilStartTime?: CivilDateTime;
  civilEndTime?: CivilDateTime;
  startTime?: string;
  endTime?: string;
  timeInHeartRateZone?: {
    timeInHeartRateZones?: TimeInHeartRateZoneValue[];
  };
}

export interface ActiveMinutesRollupDataPoint {
  civilStartTime?: CivilDateTime;
  civilEndTime?: CivilDateTime;
  startTime?: string;
  endTime?: string;
  activeMinutes?: {
    activeMinutesRollupByActivityLevel?: Array<{
      activityLevel: 'ACTIVITY_LEVEL_UNSPECIFIED' | 'LIGHT' | 'MODERATE' | 'VIGOROUS';
      activeMinutesSum?: string;
    }>;
  };
}

export interface DailyVo2MaxDataPoint {
  name: string;
  dataSource: DataSource;
  dailyVo2Max: {
    date: CivilDate;
    vo2Max: number;
    estimated?: boolean;
    cardioFitnessLevel?: 'CARDIO_FITNESS_LEVEL_UNSPECIFIED' | 'POOR' | 'FAIR' | 'AVERAGE' | 'GOOD' | 'VERY_GOOD' | 'EXCELLENT';
  };
}

export interface DailyHeartRateZonesDataPoint {
  name: string;
  dataSource: DataSource;
  dailyHeartRateZones: {
    date: CivilDate;
    heartRateZones: Array<{
      heartRateZoneType: 'HEART_RATE_ZONE_TYPE_UNSPECIFIED' | 'LIGHT' | 'MODERATE' | 'VIGOROUS' | 'PEAK';
      minBeatsPerMinute: string;
      maxBeatsPerMinute: string;
    }>;
  };
}

// Shared types
export interface DataSource {
  recordingMethod: string;
  device?: { manufacturer?: string; displayName?: string };
  application?: { packageName?: string };
  platform: string;
}

export interface TimeInterval {
  startTime: string;
  endTime: string;
  startUtcOffset?: string;
  endUtcOffset?: string;
  civilStartTime?: CivilDateTime;
  civilEndTime?: CivilDateTime;
}

export interface SampleTime {
  physicalTime: string;
  utcOffset?: string;
  civilTime?: CivilDateTime;
}

export interface CivilDateTime {
  date: CivilDate;
  time?: { hours?: number; minutes?: number; seconds?: number };
}

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

// API response wrappers
export interface ListResponse<T> {
  dataPoints: T[];
  nextPageToken?: string;
}

export interface RollupResponse<T> {
  rollupDataPoints: T[];
}

// Profile
export interface UserProfile {
  name: string;
  displayName?: string;
  avatar?: string;
  age?: number;
  gender?: string;
  height?: number;
  weight?: number;
}

export interface UserIdentity {
  name: string;
  legacyUserId: string;
  healthUserId: string;
}
