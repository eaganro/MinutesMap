export const NOT_AVAILABLE_STATUS_CODES = [403, 404];

export const isNotAvailableStatus = (status) =>
  Number.isFinite(status) && NOT_AVAILABLE_STATUS_CODES.includes(Number(status));

export const classifyFetchResult = ({ ok, status, error }) => {
  if (ok) return 'success';
  if (isNotAvailableStatus(status)) return 'not-available';
  if (error) return 'network-error';
  return 'http-error';
};

export async function fetchJson(url, { fetchImpl = globalThis.fetch } = {}) {
  if (!fetchImpl) {
    return {
      ok: false,
      status: null,
      data: null,
      error: new Error('No fetch implementation available.'),
    };
  }

  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: null,
      };
    }

    const data = await response.json();
    return {
      ok: true,
      status: response.status,
      data,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      data: null,
      error,
    };
  }
}
