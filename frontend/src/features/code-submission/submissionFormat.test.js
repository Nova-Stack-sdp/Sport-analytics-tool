import {
  ALLOWED_LANGUAGES,
  LIMITS,
  parseTags,
  validateSubmission,
  normalizeSubmission,
} from './submissionFormat';

function validDraft(overrides = {}) {
  return {
    title: 'Tyre delta per stint',
    language: 'JavaScript',
    code: 'export function tyreDelta(stints) {\n  return stints.map((s) => s.delta);\n}',
    description: 'Lap-time delta per stint, positive for deg.',
    tags: 'tyres, strategy',
    ...overrides,
  };
}

describe('validateSubmission', () => {
  test('accepts a draft that satisfies every rule', () => {
    const result = validateSubmission(validDraft());

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test('requires a description of at least 10 characters (matching the backend)', () => {
    const required = { field: 'description', message: 'Description is required: say what the code does.' };
    expect(validateSubmission(validDraft({ description: '' })).errors).toEqual([required]);
    expect(validateSubmission(validDraft({ description: undefined })).errors).toEqual([required]);
    expect(validateSubmission(validDraft({ description: '   ' })).errors).toEqual([required]);
    expect(validateSubmission(validDraft({ description: 'too short' })).errors).toEqual([
      { field: 'description', message: 'Description must be at least 10 characters.' },
    ]);
    expect(validateSubmission(validDraft({ description: 'd'.repeat(LIMITS.descriptionMin) })).valid).toBe(true);
  });

  test('accepts every boundary value exactly at the limits', () => {
    const result = validateSubmission(validDraft({
      title: 'a'.repeat(LIMITS.titleMin),
      code: 'x'.repeat(LIMITS.codeMax),
      description: 'd'.repeat(LIMITS.descriptionMax),
      tags: 'a, b, c, d, e', // maxTags tags, each well under tagMax
    }));

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test('does not throw on an empty or missing draft', () => {
    expect(validateSubmission({}).errors.map((e) => e.field)).toEqual(['title', 'language', 'code', 'description']);
    expect(validateSubmission().errors.map((e) => e.field)).toEqual(['title', 'language', 'code', 'description']);
  });

  test('reports every violation at once, in field order', () => {
    const result = validateSubmission({
      title: 'ab', // too short
      language: 'Ruby', // not on the allowed list
      code: '   \n\t ', // whitespace only
      description: 'd'.repeat(LIMITS.descriptionMax + 1),
      tags: 'a, b, c, d, e, f', // one too many
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      { field: 'title', message: 'Title must be at least 3 characters.' },
      { field: 'language', message: 'Language must be one of: JavaScript, Python.' },
      { field: 'code', message: 'Code is required.' },
      { field: 'description', message: 'Description must be at most 1000 characters.' },
      { field: 'tags', message: 'Use at most 5 tags.' },
    ]);
  });
});

describe('validateSubmission — title rules', () => {
  test('a missing or whitespace-only title counts as absent', () => {
    for (const title of ['', '   ', '\t\n']) {
      const result = validateSubmission(validDraft({ title }));
      expect(result.errors).toEqual([{ field: 'title', message: 'Title is required.' }]);
    }
  });

  test('a title longer than the limit is rejected after trimming', () => {
    const result = validateSubmission(validDraft({ title: `  ${'a'.repeat(LIMITS.titleMax + 1)}  ` }));

    expect(result.errors).toEqual([{ field: 'title', message: 'Title must be at most 80 characters.' }]);
  });
});

describe('validateSubmission — language rules', () => {
  test('the language has to be one the pipeline can run', () => {
    const result = validateSubmission(validDraft({ language: 'Ruby' }));

    expect(result.errors).toEqual([
      { field: 'language', message: `Language must be one of: ${ALLOWED_LANGUAGES.join(', ')}.` },
    ]);
  });

  test('an empty language is required, not "not allowed"', () => {
    const result = validateSubmission(validDraft({ language: '  ' }));

    expect(result.errors).toEqual([{ field: 'language', message: 'Language is required.' }]);
  });
});

describe('validateSubmission — code rules', () => {
  test('code that is only whitespace is treated as missing', () => {
    const result = validateSubmission(validDraft({ code: '\n\t  \n' }));

    expect(result.errors).toEqual([{ field: 'code', message: 'Code is required.' }]);
  });

  test('code over the size limit is rejected, whitespace included', () => {
    const result = validateSubmission(validDraft({ code: `x\n${'y'.repeat(LIMITS.codeMax)}` }));

    expect(result.errors).toEqual([{ field: 'code', message: 'Code must be at most 50000 characters.' }]);
  });
});

describe('validateSubmission — tag rules', () => {
  test('a tag longer than the limit is flagged after normalization', () => {
    const result = validateSubmission(validDraft({ tags: `ok, #${'x'.repeat(LIMITS.tagMax + 1)}` }));

    expect(result.errors).toEqual([{ field: 'tags', message: 'Each tag must be at most 24 characters.' }]);
  });

  test('duplicates collapse before the count is checked', () => {
    const result = validateSubmission(validDraft({ tags: 'pit, PIT, #Pit, Pit ' }));

    expect(result).toEqual({ valid: true, errors: [] });
  });
});

describe('parseTags', () => {
  test('splits on commas, trims, drops #, lowercases, and dedupes', () => {
    expect(parseTags('Pit Strategy, #stints,, TYRES, ')).toEqual(['pit strategy', 'stints', 'tyres']);
  });

  test('empty and missing input produce an empty array', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(',, ,')).toEqual([]);
  });

  test('array input goes through the same normalization', () => {
    expect(parseTags(['A', 'a', ' b ', '#c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('normalizeSubmission', () => {
  test('produces the exact payload the API seam will POST', () => {
    const code = 'def tyre_delta(stints):\n    return [s["delta"] for s in stints]\n';

    expect(normalizeSubmission({
      title: '  Tyre delta per stint  ',
      language: 'Python',
      code,
      description: '  Positive values mean deg.  ',
      tags: 'Tyres, #strategy',
    })).toEqual({
      title: 'Tyre delta per stint',
      language: 'Python',
      code,
      description: 'Positive values mean deg.',
      tags: ['tyres', 'strategy'],
    });
  });

  test('leaves code verbatim — whitespace inside the script is the submitter’s', () => {
    const code = '  export const x = 1;\n\n\n';

    expect(normalizeSubmission(validDraft({ code })).code).toBe(code);
  });
});
