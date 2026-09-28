function searchableArticle(article) {
  return `${article?.title || ''} ${article?.summary || ''}`.toLowerCase();
}

function searchableTerms(item, type) {
  const terms = [item?.name, item?.meetingName, item?.circuitName, item?.country]
    .filter(Boolean)
    .map((term) => String(term).toLowerCase());

  if (type === 'driver' && item?.name) {
    const surname = item.name.trim().split(/\s+/).at(-1);
    if (surname?.length > 2) terms.push(surname.toLowerCase());
  }

  if (type === 'team' && item?.name) {
    const aliases = {
      'red bull racing': ['red bull'],
      'oracle red bull racing': ['red bull'],
      'mclaren racing': ['mclaren'],
      'scuderia ferrari': ['ferrari'],
      'mercedes-amg petronas formula one team': ['mercedes'],
      'aston martin aramco formula one team': ['aston martin'],
      'williams racing': ['williams'],
      'haas f1 team': ['haas'],
      'visa cash app rb formula one team': ['racing bulls', 'vcarb'],
      'bwt alpine f1 team': ['alpine'],
      'audi revolut f1 team': ['audi'],
      'cadillac formula 1 team': ['cadillac'],
    };
    terms.push(...(aliases[item.name.toLowerCase()] || []));
  }

  return [...new Set(terms.filter((term) => term.length > 2))];
}

function matchesItem(articleText, item, type) {
  return searchableTerms(item, type).some((term) => articleText.includes(term));
}

function selectedItems(ids, items) {
  const selected = new Set((ids || []).map(String));
  return (items || []).filter((item) => selected.has(String(item.id)));
}

function isCurrentRaceStory(article) {
  const text = searchableArticle(article);
  return /\b(grand prix|gp|race|qualifying|sprint|pole position|starting grid|circuit|race weekend)\b/i.test(text);
}

export function articleMatchesPreferences(article, preferences, catalog) {
  const text = searchableArticle(article);
  const drivers = selectedItems(preferences?.followedDriverIds, catalog?.drivers);
  const teams = selectedItems(preferences?.followedTeamIds, catalog?.teams);

  return drivers.some((item) => matchesItem(text, item, 'driver'))
    || teams.some((item) => matchesItem(text, item, 'team'));
}

export function filterNewsItems(items, filter, preferences, catalog) {
  if (!Array.isArray(items)) return [];
  if (filter === 'latest') return items;

  const hasPreferences = Boolean(
    preferences?.followedDriverIds?.length
    || preferences?.followedTeamIds?.length
  );
  if (filter === 'for-you' && !hasPreferences) return items;
  if (filter === 'races') return items.filter(isCurrentRaceStory);

  const selectedByType = {
    drivers: { ids: preferences?.followedDriverIds, items: catalog?.drivers, type: 'driver' },
    teams: { ids: preferences?.followedTeamIds, items: catalog?.teams, type: 'team' },
  }[filter];

  if (selectedByType) {
    const selected = selectedItems(selectedByType.ids, selectedByType.items);
    return items.filter((article) => {
      const text = searchableArticle(article);
      return selected.some((item) => matchesItem(text, item, selectedByType.type));
    });
  }

  return items.filter((article) => articleMatchesPreferences(article, preferences, catalog));
}
