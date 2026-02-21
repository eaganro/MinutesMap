import { describe, expect, it } from 'vitest';
import { buildTeamLogoSrc } from './playExportAssets';

describe('playExportAssets', () => {
  it('builds normalized team logo paths from team abbreviations', () => {
    expect(buildTeamLogoSrc('phi')).toMatch(/\/img\/teams\/PHI\.svg$/);
    expect(buildTeamLogoSrc(' gs-w ')).toMatch(/\/img\/teams\/GSW\.svg$/);
  });

  it('returns an empty path when abbreviation is missing', () => {
    expect(buildTeamLogoSrc('')).toBe('');
    expect(buildTeamLogoSrc(null)).toBe('');
  });
});
