import { healthFetch } from './client';
import type {
  ActiveMinutesRollupDataPoint,
  ActiveZoneMinutesRollupDataPoint,
  DailyHeartRateZonesDataPoint,
  DailyVo2MaxDataPoint,
  ListResponse,
  RollupResponse,
  TimeInHeartRateZoneRollupDataPoint,
} from '../types/health';

function getDailyRollUpBody(daysBack: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  return {
    range: {
      start: {
        date: { year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate() },
        time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
      },
      end: {
        date: { year: end.getFullYear(), month: end.getMonth() + 1, day: end.getDate() },
        time: { hours: 23, minutes: 59, seconds: 59, nanos: 0 },
      },
    },
    windowSizeDays: 1,
  };
}

function startDateFilter(daysBack: number, field: string) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  return `${field} >= "${startDate.toISOString().split('T')[0]}"`;
}

async function getDailyRollup<T>(accessToken: string, dataType: string, daysBack: number): Promise<T[]> {
  const data = await healthFetch<RollupResponse<T>>(
    `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(getDailyRollUpBody(daysBack)),
    }
  );

  return data.rollupDataPoints || [];
}

export function getActiveZoneMinutesDaily(accessToken: string, daysBack: number = 7) {
  return getDailyRollup<ActiveZoneMinutesRollupDataPoint>(accessToken, 'active-zone-minutes', daysBack);
}

export function getTimeInHeartRateZoneDaily(accessToken: string, daysBack: number = 7) {
  return getDailyRollup<TimeInHeartRateZoneRollupDataPoint>(accessToken, 'time-in-heart-rate-zone', daysBack);
}

export function getActiveMinutesDaily(accessToken: string, daysBack: number = 7) {
  return getDailyRollup<ActiveMinutesRollupDataPoint>(accessToken, 'active-minutes', daysBack);
}

export async function getDailyVo2Max(accessToken: string, daysBack: number = 30) {
  const params = new URLSearchParams({
    filter: startDateFilter(daysBack, 'daily_vo2_max.date'),
    page_size: '100',
  });

  const data = await healthFetch<ListResponse<DailyVo2MaxDataPoint>>(
    `/users/me/dataTypes/daily-vo2-max/dataPoints?${params}`,
    accessToken
  );

  return data.dataPoints || [];
}

export async function getDailyHeartRateZones(accessToken: string, daysBack: number = 30) {
  const params = new URLSearchParams({
    filter: startDateFilter(daysBack, 'daily_heart_rate_zones.date'),
    page_size: '100',
  });

  const data = await healthFetch<ListResponse<DailyHeartRateZonesDataPoint>>(
    `/users/me/dataTypes/daily-heart-rate-zones/dataPoints?${params}`,
    accessToken
  );

  return data.dataPoints || [];
}
