import { healthFetch } from './client';

export async function getUserInfo(accessToken: string): Promise<{ name?: string; picture?: string; email?: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return {};
  return res.json();
}

export async function getIdentity(accessToken: string) {
  return healthFetch<Record<string, unknown>>('/users/me/identity', accessToken);
}

export async function getProfile(accessToken: string) {
  return healthFetch<Record<string, unknown>>('/users/me/profile', accessToken);
}

export async function getSettings(accessToken: string) {
  return healthFetch<Record<string, unknown>>('/users/me/settings', accessToken);
}

export async function getPairedDevices(accessToken: string) {
  return healthFetch<{ pairedDevices?: Array<Record<string, unknown>> }>('/users/me/pairedDevices', accessToken);
}
