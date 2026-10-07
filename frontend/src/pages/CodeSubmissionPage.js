import { useState } from 'react';
import { submitCodeSubmission } from '../api/client';
import {
  ALLOWED_LANGUAGES,
  LIMITS,
  validateSubmission,
  normalizeSubmission,
} from '../features/code-submission/submissionFormat';
import '../styles/codeSubmission.css';

// Prefer the backend's own explanation over the generic "failed with status N"
// (same contract as the data-submissions panel).
function describeError(err) {
  if (err.status === 401) return 'You need to be signed in to do this. Please sign in again.';
  return err.body?.error || err.message;
}

// "Submit Code" tab of the Developer page. The format contract lives in
// features/code-submission/submissionFormat.js and is enforced in the browser
// first — an invalid draft never reaches the network. A valid one is saved by
// POST /api/code-submissions with status 'pending' until an admin reviews it.
//
// The draft holds exactly the fields the form collects — no tags: this page
// doesn't ask for them, and normalizeSubmission() fills in the empty array
// the POST body contract still expects.
const EMPTY_DRAFT = { title: '', language: '', code: '', description: '' };

// Worked examples for the empty fields — the same stat the Title placeholder
// names (a tyre delta), so the form shows what each box expects.
const CODE_EXAMPLE = [
  'e.g',
  'export function tyreDelta(stint) {',
  '  return (stint.lastLapTime - stint.firstLapTime) / stint.lapCount;',
  '}',
].join('\n');

const DESCRIPTION_EXAMPLE =
  'e.g The code calculates how much slower the car gets per lap as the tyres wear within a stint.';

function CodeSubmissionPage() {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [validationErrors, setValidationErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);

  // Live readouts for the skin: the counters mirror the rules in
  // submissionFormat.js.
  const titleLength = draft.title.trim().length;
  const descriptionLength = draft.description.trim().length;
  const codeChars = draft.code.length;
  const codeLines = draft.code ? draft.code.split('\n').length : 0;
  const errorFor = (field) => validationErrors.find((error) => error.field === field)?.message;
  const countClass = (length, max) => `cs-count${length > max ? ' is-over' : ''}`;

  function updateField(name, value) {
    setDraft((d) => ({ ...d, [name]: value }));
    // Editing after a failed check clears the stale complaints.
    setValidationErrors([]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitResult(null);
    // Format first — nothing leaves the browser on an invalid draft.
    const { valid, errors } = validateSubmission(draft);
    if (!valid) {
      setValidationErrors(errors);
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitCodeSubmission(normalizeSubmission(draft));
      setSubmitResult(result);
    } catch (err) {
      setSubmitError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="developer-panel" id="page-code-submissions">
      <div className="rationale">
        <span className="ic">◆</span>
        <div>
          <b>Why this tab:</b> a derived statistic is a script that reads a session's events
          — laps, stints, pit stops, weather — and computes something new from them.
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card cs-form-card">
          <div className="card-title">Submit a script</div>
          <div className="card-title-sub">Name the statistic and paste the script that computes it</div>

          <form className="cs-form" onSubmit={handleSubmit}>
            {/* Identity first: the two short answers side by side, so they
                stop carrying the same weight as the script itself. */}
            <div className="cs-band cs-band-identity">
              <div className="cs-field">
                <div className="cs-head">
                  <label htmlFor="cs-title">Name/Title</label>
                  <span className="cs-req">Required</span>
                </div>
                <input
                  id="cs-title"
                  className="cs-input"
                  type="text"
                  placeholder="e.g Tyre delta per stint"
                  value={draft.title}
                  aria-invalid={Boolean(errorFor('title'))}
                  aria-describedby={errorFor('title') ? 'cs-title-error' : undefined}
                  onChange={(e) => updateField('title', e.target.value)}
                />
                <div className="cs-foot">
                  <span className="cs-hint">Cool and descriptive.</span>
                  <span className={countClass(titleLength, LIMITS.titleMax)}>
                    {titleLength}/{LIMITS.titleMax}
                  </span>
                </div>
                {errorFor('title') && (
                  <p className="cs-field-error" id="cs-title-error">{errorFor('title')}</p>
                )}
              </div>

              <div className="cs-field">
                <div className="cs-head">
                  <label htmlFor="cs-language">Language</label>
                  <span className="cs-req">Required</span>
                </div>
                <select
                  id="cs-language"
                  className="cs-input"
                  value={draft.language}
                  aria-invalid={Boolean(errorFor('language'))}
                  aria-describedby={errorFor('language') ? 'cs-language-error' : undefined}
                  onChange={(e) => updateField('language', e.target.value)}
                >
                  <option value="">Select a language…</option>
                  {ALLOWED_LANGUAGES.map((language) => (
                    <option key={language} value={language}>{language}</option>
                  ))}
                  {/* Not selectable on purpose: what happens for an unlisted
                      language is still to be decided, so picking it does
                      nothing for now. */}
                  <option disabled>Language not above?</option>
                </select>
                <div className="cs-foot">
                  <span className="cs-hint">What language the script is written in.</span>
                </div>
                {errorFor('language') && (
                  <p className="cs-field-error" id="cs-language-error">{errorFor('language')}</p>
                )}
              </div>
            </div>

            {/* The artifact itself gets an editor surface — bar, language,
                readout — instead of one more anonymous textarea. */}
            <div className={`cs-editor${errorFor('code') ? ' is-invalid' : ''}`}>
              <div className="cs-editor-bar">
                <div className="cs-head">
                  <label htmlFor="cs-code">Code</label>
                  <span className="cs-req">Required</span>
                </div>
                <div className="cs-editor-meta">
                  <span className={`cs-lang${draft.language ? '' : ' is-empty'}`}>
                    {draft.language || 'No language yet'}
                  </span>
                  <span className={countClass(codeChars, LIMITS.codeMax)}>
                    {codeLines} lines · {codeChars}/{LIMITS.codeMax}
                  </span>
                </div>
              </div>
              <textarea
                id="cs-code"
                className="cs-code"
                rows={14}
                spellCheck={false}
                placeholder={CODE_EXAMPLE}
                value={draft.code}
                aria-invalid={Boolean(errorFor('code'))}
                aria-describedby={errorFor('code') ? 'cs-code-error' : undefined}
                onChange={(e) => updateField('code', e.target.value)}
              />
              {errorFor('code') && (
                <p className="cs-field-error" id="cs-code-error">{errorFor('code')}</p>
              )}
            </div>

            <div className="cs-band cs-band-meta">
              <div className="cs-field">
                <div className="cs-head">
                  <label htmlFor="cs-description">Description (optional)</label>
                </div>
                <textarea
                  id="cs-description"
                  className="cs-input"
                  rows={4}
                  placeholder={DESCRIPTION_EXAMPLE}
                  value={draft.description}
                  aria-invalid={Boolean(errorFor('description'))}
                  aria-describedby={errorFor('description') ? 'cs-description-error' : undefined}
                  onChange={(e) => updateField('description', e.target.value)}
                />
                <div className="cs-foot">
                  <span className="cs-hint">What the statistic means.</span>
                  <span className={countClass(descriptionLength, LIMITS.descriptionMax)}>
                    {descriptionLength}/{LIMITS.descriptionMax}
                  </span>
                </div>
                {errorFor('description') && (
                  <p className="cs-field-error" id="cs-description-error">{errorFor('description')}</p>
                )}
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit script'}
            </button>
          </form>

          {/* The messages now sit on their fields — this box only says how
              many there are and which ones to look at. */}
          {validationErrors.length > 0 && (
            <div className="error-box">
              <div className="cs-summary-head">
                <span className="eh">⚠ Fix these before submitting</span>
                <span className="cs-summary-count">{validationErrors.length} to fix</span>
              </div>
              <div className="cs-summary-fields">
                {validationErrors.map((error) => (
                  <span key={error.field} className="pill pill-red mono">{error.field}</span>
                ))}
              </div>
            </div>
          )}

          {submitError && (
            <div className="error-box">
              <div className="eh">⚠ {submitError}</div>
            </div>
          )}

          {submitResult && (
            <div className="cs-success">
              <div className="cs-success-head">✓ Submitted</div>
              <div className="card-note">
                {submitResult.id && <>Submission ID <span className="mono">{submitResult.id}</span>. </>}
                Keep the ID if you need to refer to it later.
              </div>
              <div className="cs-success-status">
                <span className="pill pill-amber">{submitResult.status || 'pending'}</span>
                <span>You'll be notified once it's approved or rejected.</span>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">After you submit</div>
              <div className="card-title-sub">How your script gets reviewed</div>
            </div>
          </div>
          <ol className="cs-steps">
            <li>
              <span className="cs-step-n">1</span>
              <span>Your script goes to the admin team for review.</span>
            </li>
            <li>
              <span className="cs-step-n">2</span>
              <span>The admin approves it or rejects it.</span>
            </li>
            <li>
              <span className="cs-step-n">3</span>
              <span>You get a notification with the outcome.</span>
            </li>
          </ol>
          <div className="cs-statuses">
            <div className="cs-statuses-head">
              After you submit, the status shown here moves through:
            </div>
            <div className="cs-status-row">
              <span className="pill pill-amber">pending</span>
              <span>Waiting for the admin's decision.</span>
            </div>
            <div className="cs-status-row">
              <span className="pill pill-green">approved</span>
              <span>Accepted — the statistic goes live.</span>
            </div>
            <div className="cs-status-row">
              <span className="pill pill-red">rejected</span>
              <span>Something went wrong with your code, you can review admins decision to know what.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CodeSubmissionPage;
