export const wsLocation = import.meta.env.VITE_WS_LOCATION;
export const PREFIX = import.meta.env.VITE_PREFIX;
const RAW_ASSET_PREFIX = import.meta.env.VITE_ASSET_PREFIX;
export const ASSET_PREFIX = RAW_ASSET_PREFIX !== undefined
  ? RAW_ASSET_PREFIX
  : (import.meta.env.DEV ? '' : PREFIX);

export const dateAdd = 2;
export const dateMinus = 0;
