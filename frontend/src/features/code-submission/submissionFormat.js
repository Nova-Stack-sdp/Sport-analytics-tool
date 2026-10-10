// Pure format contract for code submissions — the one place that decides
// what a well-formed submission looks like. The submit form runs it for
// client-side validation, normalizeSubmission() produces the exact body the
// API seam will POST, and the colocated tests pin the rules themselves so
// the backend can be wired against the same contract.

// The languages the review pipeline can actually run. Kept deliberately
// small; the backend route is free to reject anything else server-side too.
export const ALLOWED_LANGUAGES = ['JavaScript', 'Python'];

export const LIMITS = {
  titleMin: 3,
  titleMax: 80,
  codeMax: 50000,
  // Same rule as the backend: the description is what the public API and
  // the stats page show as "what this code does".
  descriptionMin: 10,
  descriptionMax: 1000,
  maxTags: 5,
  tagMax: 24,
};

// Tags arrive as free text ("Pit Strategy, #stints,, TYRES,") — split on
// commas, drop the "#" people type out of habit, lowercase, and dedupe.
// Empty segments vanish, so "a,, b," -> ['a', 'b']. Arrays pass through the
// same normalization so callers never have to care which they have.
export function parseTags(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  const seen = new Set();
  const tags = [];
  for (const item of list) {
    const tag = String(item ?? '').trim().replace(/^#/, '').toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

// Returns { valid: boolean, errors: [{ field, message }] } with errors in a
// stable field order (title, language, code, description, tags) so the form
// can render them top-to-bottom the way the user filled them in.
export function validateSubmission(draft = {}) {
  const errors = [];
  const title = String(draft.title ?? '').trim();
  const language = String(draft.language ?? '').trim();
  const code = String(draft.code ?? '');
  const description = String(draft.description ?? '').trim();
  const tags = parseTags(draft.tags);

  if (!title) {
    errors.push({ field: 'title', message: 'Title is required.' });
  } else if (title.length < LIMITS.titleMin) {
    errors.push({ field: 'title', message: `Title must be at least ${LIMITS.titleMin} characters.` });
  } else if (title.length > LIMITS.titleMax) {
    errors.push({ field: 'title', message: `Title must be at most ${LIMITS.titleMax} characters.` });
  }

  if (!language) {
    errors.push({ field: 'language', message: 'Language is required.' });
  } else if (!ALLOWED_LANGUAGES.includes(language)) {
    errors.push({ field: 'language', message: `Language must be one of: ${ALLOWED_LANGUAGES.join(', ')}.` });
  }

  if (!code.trim()) {
    errors.push({ field: 'code', message: 'Code is required.' });
  } else if (code.length > LIMITS.codeMax) {
    errors.push({ field: 'code', message: `Code must be at most ${LIMITS.codeMax} characters.` });
  }

  if (!description) {
    errors.push({ field: 'description', message: 'Description is required: say what the code does.' });
  } else if (description.length < LIMITS.descriptionMin) {
    errors.push({ field: 'description', message: `Description must be at least ${LIMITS.descriptionMin} characters.` });
  } else if (description.length > LIMITS.descriptionMax) {
    errors.push({ field: 'description', message: `Description must be at most ${LIMITS.descriptionMax} characters.` });
  }

  if (tags.length > LIMITS.maxTags) {
    errors.push({ field: 'tags', message: `Use at most ${LIMITS.maxTags} tags.` });
  }
  if (tags.some((tag) => tag.length > LIMITS.tagMax)) {
    errors.push({ field: 'tags', message: `Each tag must be at most ${LIMITS.tagMax} characters.` });
  }

  return { valid: errors.length === 0, errors };
}

// The exact body POST /api/code-submissions will receive. Call it on a draft
// that already passed validateSubmission — it trims and normalizes but never
// invents missing values.
export function normalizeSubmission(draft = {}) {
  const testDatasetId = String(draft.testDatasetId ?? '').trim();
  return {
    title: String(draft.title ?? '').trim(),
    language: String(draft.language ?? '').trim(),
    code: String(draft.code ?? ''),
    description: String(draft.description ?? '').trim(),
    tags: parseTags(draft.tags),
    // Optional: the developer's own test data for this script. Only sent
    // when one was picked, so the body is unchanged otherwise.
    ...(testDatasetId && { testDatasetId }),
  };
}

// Which of a developer's dataset uploads can be attached to code as test
// data: uploaded as test data, not deleted, and with valid records (an
// auto-rejected upload is no use for testing). The backend checks the same
// and also refuses data already attached to another script.
export function usableTestDatasets(submissions = []) {
  return submissions.filter((s) => s.purpose === 'code_test' && !s.deletedAt && s.status === 'pending');
}

export function describeTestDataset(s) {
  const meeting = s.session?.meeting;
  const where = meeting ? `${meeting.name} · ${s.session.type} ${meeting.season}` : `session_key ${s.session?.openf1Key ?? '?'}`;
  const valid = s.summary?.validRecords;
  const records = valid == null ? '' : ` — ${valid} valid record${valid === 1 ? '' : 's'}`;
  const when = s.submittedAt ? `, uploaded ${new Date(s.submittedAt).toLocaleDateString()}` : '';
  return `${where}${records}${when}`;
}
