function slug(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const OFFICIAL_2026_TEAMS = [
  'McLaren',
  'Mercedes',
  'Ferrari',
  'Red Bull Racing',
  'Racing Bulls',
  'Alpine',
  'Haas F1 Team',
  'Audi',
  'Williams',
  'Aston Martin',
  'Cadillac',
].map((name) => ({ id: `team-${slug(name)}`, name }));

export const OFFICIAL_2026_DRIVERS = [
  ['Lando Norris', 'McLaren'],
  ['Oscar Piastri', 'McLaren'],
  ['George Russell', 'Mercedes'],
  ['Kimi Antonelli', 'Mercedes'],
  ['Charles Leclerc', 'Ferrari'],
  ['Lewis Hamilton', 'Ferrari'],
  ['Max Verstappen', 'Red Bull Racing'],
  ['Isack Hadjar', 'Red Bull Racing'],
  ['Liam Lawson', 'Racing Bulls'],
  ['Arvid Lindblad', 'Racing Bulls'],
  ['Pierre Gasly', 'Alpine'],
  ['Franco Colapinto', 'Alpine'],
  ['Esteban Ocon', 'Haas F1 Team'],
  ['Oliver Bearman', 'Haas F1 Team'],
  ['Nico Hulkenberg', 'Audi'],
  ['Gabriel Bortoleto', 'Audi'],
  ['Carlos Sainz', 'Williams'],
  ['Alexander Albon', 'Williams'],
  ['Fernando Alonso', 'Aston Martin'],
  ['Lance Stroll', 'Aston Martin'],
  ['Sergio Perez', 'Cadillac'],
  ['Valtteri Bottas', 'Cadillac'],
].map(([name, teamName]) => ({
  id: `driver-${slug(name)}`,
  name,
  teamName,
}));

export function preferenceCatalog(liveItems, fallbackItems, type) {
  if (!Array.isArray(liveItems) || liveItems.length === 0) return fallbackItems;

  return liveItems
    .filter((item) => item?.name)
    .map((item) => ({
      ...item,
      sourceId: item.id,
      id: `${type}-${slug(item.name)}`,
    }));
}
