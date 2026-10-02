import { useEffect, useState } from 'react';
import { getCachedImageUrl, getDriverImageUrl, getDrivers, getTeams } from '../../api/client';

// The app's own driver and team records, for the Driver Analysis card's
// identity block: the same /api/drivers and /api/teams endpoints the rest of
// the app serves its photos and logos from, so a face or a badge here is the
// exact asset the driver and team pages show. One fetch per mount — neither
// list moves with the playhead or the picked race — and best-effort: a
// failure, a missing name match or a missing photo leaves the card's
// text/colour fallbacks standing rather than an empty frame.
//
// Matching is by name, because the replay data knows drivers only as names.
// The lists cover the database's latest season, so a driver from an older
// race who isn't on them simply gets no photo — never a wrong face.

export function normalizePersonName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// The photo URL a driver record resolves to, in the same precedence the
// driver detail page uses: an uploaded photo wins, then the cached headshot,
// then the raw remote URL through the caching image proxy.
export function driverPhotoUrl(record) {
  if (!record) return null;
  if (record.uploadedImageVersion) return getDriverImageUrl(record.id, record.uploadedImageVersion);
  if (record.cachedImageUrl) return getDriverImageUrl(record.id);
  if (record.imageUrl) return getCachedImageUrl(record.imageUrl);
  return null;
}

export function useRaceSyncPeople() {
  const [people, setPeople] = useState({ drivers: [], teams: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDrivers(), getTeams()])
      .then(([driverList, teamList]) => {
        if (cancelled) return;
        setPeople({
          drivers: Array.isArray(driverList?.drivers) ? driverList.drivers : [],
          teams: Array.isArray(teamList?.teams) ? teamList.teams : [],
        });
      })
      .catch(() => {
        // Best-effort enrichment: the panels render their fallbacks without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { drivers, teams } = people;
  return {
    drivers,
    teams,
    driverByName: (name) =>
      drivers.find((driver) => normalizePersonName(driver.name) === normalizePersonName(name)) ??
      null,
    teamByName: (name) =>
      teams.find((team) => normalizePersonName(team.name) === normalizePersonName(name)) ?? null,
  };
}
