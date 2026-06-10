import { healthFetch } from './client';

export interface HeartRateSample {
  time: string;
  bpm: number;
}

interface HrListResponse {
  dataPoints: Array<{ heartRate?: { sampleTime?: { physicalTime?: string }; beatsPerMinute?: string } }>;
  nextPageToken?: string;
}

export async function getDailyHeartRate(
  accessToken: string,
  date: Date = new Date()
): Promise<HeartRateSample[]> {
  const dateStr = date.toISOString().split('T')[0];
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDateStr = nextDay.toISOString().split('T')[0];

  const filter = `heart_rate.sample_time.physical_time >= "${dateStr}T00:00:00Z" AND heart_rate.sample_time.physical_time < "${nextDateStr}T00:00:00Z"`;
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
