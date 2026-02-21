import { ASSET_PREFIX } from '../../../environment';

const LOGO_BASE_PATH = `${ASSET_PREFIX ? ASSET_PREFIX : ''}/img/teams`;
const LOAD_TIMEOUT_MS = 1200;

const logoImageCache = new Map();

const normalizeTeamAbbr = (value) => {
  const token = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return token || '';
};

export const buildTeamLogoSrc = (teamAbbr) => {
  const normalized = normalizeTeamAbbr(teamAbbr);
  if (!normalized) return '';
  return `${LOGO_BASE_PATH}/${normalized}.svg`;
};

const preloadLogoImage = (src) => {
  if (!src || typeof Image === 'undefined') {
    return Promise.resolve(null);
  }
  if (logoImageCache.has(src)) {
    return logoImageCache.get(src);
  }

  const request = new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timeoutId = setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timeoutId);
      finish(img);
    };
    img.onerror = () => {
      clearTimeout(timeoutId);
      finish(null);
    };
    img.src = src;
  });

  logoImageCache.set(src, request);
  request.then((image) => {
    if (!image) {
      logoImageCache.delete(src);
    }
  });
  return request;
};

export const loadTeamLogosForExport = async ({ awayTeamAbbr, homeTeamAbbr }) => {
  const awaySrc = buildTeamLogoSrc(awayTeamAbbr);
  const homeSrc = buildTeamLogoSrc(homeTeamAbbr);
  const [away, home] = await Promise.all([preloadLogoImage(awaySrc), preloadLogoImage(homeSrc)]);
  return { away, home };
};
