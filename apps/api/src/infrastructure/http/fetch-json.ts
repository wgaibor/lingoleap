function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  retries: number,
  baseDelayMs: number
): Promise<Response | null> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      await sleep(baseDelayMs * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      return response;
    }
    if (!RETRYABLE_STATUS.has(response.status)) {
      return null;
    }
    if (attempt >= retries) {
      throw new Error(`HTTP ${response.status} en ${url} tras ${retries + 1} intentos`);
    }
    await sleep(baseDelayMs * 2 ** attempt);
  }
}

export async function fetchJson(
  url: string,
  init?: RequestInit,
  retries = 3,
  baseDelayMs = 500
): Promise<unknown> {
  const response = await fetchWithRetry(url, init, retries, baseDelayMs);
  return response ? response.json() : null;
}

export async function fetchText(
  url: string,
  retries = 3,
  baseDelayMs = 500
): Promise<string | null> {
  const response = await fetchWithRetry(url, undefined, retries, baseDelayMs);
  return response ? response.text() : null;
}
