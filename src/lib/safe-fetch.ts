/**
 * Safely reads a Fetch Response and parses JSON even if an upstream proxy, CDN,
 * or Worker runtime returned an HTML error page (e.g. <!DOCTYPE html>...).
 */
export async function parseJsonResponse<T extends Record<string, unknown> = Record<string, unknown>>(
  res: Response,
  fallbackError = 'Unexpected server response. Please try again.'
): Promise<{ ok: boolean; status: number; data: T | null; errorMessage: string | null }> {
  let rawText = '';
  try {
    rawText = await res.text();
  } catch {
    return { ok: false, status: res.status, data: null, errorMessage: fallbackError };
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      ok: res.ok,
      status: res.status,
      data: ({} as T),
      errorMessage: res.ok ? null : `${fallbackError} (HTTP ${res.status})`,
    };
  }

  if (trimmed.startsWith('<')) {
    const titleMatch = trimmed.match(/<title[^>]*>([^<]+)<\/title>/i);
    const hint = titleMatch?.[1]?.trim();
    return {
      ok: false,
      status: res.status,
      data: null,
      errorMessage: hint
        ? `Server busy or timed out (${hint}, HTTP ${res.status}). Please retry or use Hosted UPI Link.`
        : `Server busy or timed out (HTTP ${res.status}). Please retry or use Hosted UPI Link.`,
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as T;
    const apiErr =
      typeof parsed?.error === 'string'
        ? parsed.error
        : typeof parsed?.message === 'string' && !res.ok
        ? parsed.message
        : null;
    return {
      ok: res.ok,
      status: res.status,
      data: parsed,
      errorMessage: res.ok ? null : (apiErr || `${fallbackError} (HTTP ${res.status})`),
    };
  } catch {
    return {
      ok: false,
      status: res.status,
      data: null,
      errorMessage: `${fallbackError} (HTTP ${res.status})`,
    };
  }
}
