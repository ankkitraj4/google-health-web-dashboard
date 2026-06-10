const BASE_URL = 'https://health.googleapis.com/v4';

let _refreshFn: (() => Promise<string | null>) | null = null;

export function setRefreshFn(fn: () => Promise<string | null>) {
  _refreshFn = fn;
}

export async function healthFetch<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  let response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // On 401, try refreshing the token once
  if (response.status === 401 && _refreshFn) {
    const newToken = await _refreshFn();
    if (newToken) {
      response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${newToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Health API error (${response.status}): ${errorText}`);
  }

  return response.json();
}
