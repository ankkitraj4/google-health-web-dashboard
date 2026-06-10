export function calcSleepScore(deep: number, rem: number, light: number, awake: number): number {
  const sleepMins = deep + rem + light;
  if (sleepMins === 0) return 0;

  // Duration component (0-35 pts): 7-9h optimal
  const hours = sleepMins / 60;
  let durationPts: number;
  if (hours >= 7 && hours <= 8.5) durationPts = 35;
  else if (hours >= 6.5) durationPts = 27 + (hours - 6.5) * 16;
  else if (hours >= 5) durationPts = 12 + (hours - 5) * 10;
  else durationPts = Math.max(0, hours * 2.4);
  if (hours > 8.5) durationPts = Math.max(28, 35 - (hours - 8.5) * 4);

  // Deep sleep component (0-20 pts): 15-20% ideal, gradual penalty
  const deepPct = deep / sleepMins;
  let deepPts: number;
  if (deepPct >= 0.17) deepPts = 18 + Math.min(2, (deepPct - 0.17) * 40);
  else if (deepPct >= 0.10) deepPts = 10 + (deepPct - 0.10) * 114;
  else deepPts = deepPct / 0.10 * 10;

  // REM component (0-20 pts): 20-25% ideal, gradual penalty
  const remPct = rem / sleepMins;
  let remPts: number;
  if (remPct >= 0.20) remPts = 17 + Math.min(3, (remPct - 0.20) * 30);
  else if (remPct >= 0.15) remPts = 12 + (remPct - 0.15) * 100;
  else remPts = remPct / 0.15 * 12;

  // Efficiency/awake component (0-25 pts): awake time penalized
  const awakeMins = awake;
  let effPts: number;
  if (awakeMins <= 5) effPts = 25;
  else if (awakeMins <= 15) effPts = 23 - (awakeMins - 5) * 0.2;
  else if (awakeMins <= 30) effPts = 21 - (awakeMins - 15) * 0.4;
  else effPts = Math.max(8, 15 - (awakeMins - 30) * 0.2);

  const raw = durationPts + deepPts + remPts + effPts;
  const compressed = raw <= 80 ? raw : 80 + (raw - 80) * 0.5;
  return Math.min(100, Math.max(0, Math.round(compressed)));
}
