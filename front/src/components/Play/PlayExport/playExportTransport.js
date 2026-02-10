const DEFAULT_REVOKE_DELAY_MS = 15000;

export const withTimeout = (promise, ms, label) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

export const dataUrlToBlob = (dataUrl) => {
  if (!dataUrl) return null;
  if (typeof atob === 'undefined') return null;
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;
  const header = parts[0];
  const data = parts[1];
  const match = header.match(/data:(.*?);base64/);
  const mime = match ? match[1] : 'image/png';
  const binary = atob(data);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }
  return new Blob([buffer], { type: mime });
};

export const canvasToBlob = (canvas) => {
  if (!canvas) return Promise.resolve(null);
  if (canvas.toBlob) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }
  try {
    return Promise.resolve(dataUrlToBlob(canvas.toDataURL('image/png')));
  } catch (_err) {
    return Promise.resolve(null);
  }
};

export const createPngFile = ({ blob, fileName }) => {
  if (!blob || !fileName) {
    return { file: null, errorMessage: null };
  }
  try {
    return {
      file: new File([blob], fileName, { type: 'image/png' }),
      errorMessage: null,
    };
  } catch (_err) {
    return {
      file: null,
      errorMessage: 'Share unavailable: File constructor failed on this device.',
    };
  }
};

export const buildSharePayload = ({ file, title, text, url }) => {
  const payload = { files: [file] };
  if (title) payload.title = title;
  if (text) payload.text = text;
  if (url) payload.url = url;
  return payload;
};

export const detectShareSupport = ({ file, navigatorRef = globalThis.navigator } = {}) => {
  if (!file || !navigatorRef?.share) {
    return { canShareFiles: false, errorMessage: null };
  }
  if (!navigatorRef.canShare) {
    return { canShareFiles: true, errorMessage: null };
  }
  try {
    return { canShareFiles: navigatorRef.canShare({ files: [file] }), errorMessage: null };
  } catch (_err) {
    return {
      canShareFiles: false,
      errorMessage: 'Share unavailable: browser rejected file sharing.',
    };
  }
};

export const shareFile = async ({
  file,
  title,
  text,
  url,
  navigatorRef = globalThis.navigator,
}) => {
  if (!file || !navigatorRef?.share) {
    return { shared: false, aborted: false, error: null };
  }
  try {
    await navigatorRef.share(buildSharePayload({ file, title, text, url }));
    return { shared: true, aborted: false, error: null };
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return { shared: false, aborted, error };
  }
};

export const createObjectUrl = (blob, urlApi = globalThis.URL) => {
  if (!blob || !urlApi?.createObjectURL) return null;
  return urlApi.createObjectURL(blob);
};

export const revokeObjectUrl = (url, urlApi = globalThis.URL) => {
  if (!url || !urlApi?.revokeObjectURL) return;
  urlApi.revokeObjectURL(url);
};

export const downloadBlob = ({
  blob,
  fileName,
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  revokeDelayMs = DEFAULT_REVOKE_DELAY_MS,
}) => {
  if (!blob || !documentRef?.createElement || !documentRef?.body) return null;
  const url = createObjectUrl(blob, urlApi);
  if (!url) return null;
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = fileName || 'play-by-play.png';
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => revokeObjectUrl(url, urlApi), revokeDelayMs);
  return url;
};
