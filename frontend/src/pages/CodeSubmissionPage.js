import { useState } from 'react';
import { submitCodeSubmission } from '../api/client';
import {
  ALLOWED_LANGUAGES,
  LIMITS,
  validateSubmission,
  normalizeSubmission,
} from '../features/code-submission/submissionFormat';

// Prefer the backend's own explanation over the generic "failed with status N"
// (same contract as the data-submissions panel).
function describeError(err) {
  if (err.status === 401) return 'You need to be signed in to do this. Please sign in again.';
  return err.body?.error || err.message;
}

const EMPTY_DRAFT = { title: '', language: '', code: '', description: '', tags: '' };

// Developer-facing code submission form. The format contract lives in
// features/code-submission/submissionFormat.js and is enforced in the browser
// first — an invalid draft never reaches the network. The API seam is real
// (POST /api/code-submissions); until the backend route exists the page
// simply shows honest loading/error/empty states rather than mock data.
function CodeSubmissionPage() {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [validationErrors, setValidationErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);

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
    <div className="page" id="page-code-submissions">
      <div className="pagehead">
        <div className="section-eyebrow">Developer</div>
        <div className="section-title">Submit Code</div>
        <div className="section-desc">
          Submit a derived-statistic script for admin review. The format is validated in the
          browser first; a valid submission enters the review queue as pending.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Why this page:</b> code follows the same review pipeline as data — a developer
            submits, an admin accepts or rejects — but the artifact is a script, so its format
            (title, language, code, description, tags) is checked in the browser before anything
            reaches the server.
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <div className="card-title" style={{ marginBottom: 4 }}>Submit a script</div>
            <div className="card-title-sub" style={{ marginBottom: 12 }}>
              A new derived statistic for an admin to review
            </div>
            <form onSubmit={handleSubmit}>
              <label style={{ display: 'block', marginBottom: 10 }}>
                Title
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4 }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                Language
                <select
                  value={draft.language}
                  onChange={(e) => updateField('language', e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4 }}
                >
                  <option value="">Select a language…</option>
                  {ALLOWED_LANGUAGES.map((language) => (
                    <option key={language} value={language}>{language}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                Code
                <textarea
                  className="mono"
                  rows={12}
                  value={draft.code}
                  onChange={(e) => updateField('code', e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4 }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                Description (optional)
                <textarea
                  rows={4}
                  value={draft.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4 }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                Tags (comma-separated, optional)
                <input
                  type="text"
                  placeholder="tyres, strategy"
                  value={draft.tags}
                  onChange={(e) => updateField('tags', e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4 }}
                />
              </label>
              <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit for review'}
              </button>
            </form>

            {validationErrors.length > 0 && (
              <div className="error-box" style={{ marginTop: 12 }}>
                <div className="eh">⚠ Fix these before submitting</div>
                <table>
                  <tbody>
                    <tr><th>Field</th><th>Problem</th></tr>
                    {validationErrors.map((error, i) => (
                      <tr key={i}>
                        <td className="mono">{error.field}</td>
                        <td className="secondary">{error.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {submitError && (
              <div className="error-box" style={{ marginTop: 12 }}>
                <div className="eh">⚠ {submitError}</div>
              </div>
            )}

            {submitResult && (
              <div className="error-box" style={{ marginTop: 12 }}>
                <div className="eh">✓ Submitted — pending review</div>
                <div className="card-note" style={{ marginTop: 0 }}>
                  {submitResult.id && <>Submission ID <span className="mono">{submitResult.id}</span>. </>}
                  An admin will review the code and either accept or reject it.
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">What happens after you submit</div>
                <div className="card-title-sub">The same review pipeline as data submissions</div>
              </div>
            </div>
            <div className="kv"><span>Status on submit</span><b>Pending</b></div>
            <div className="kv"><span>Reviewed by</span><b>An admin</b></div>
            <div className="kv"><span>Outcomes</span><b>Accepted or rejected</b></div>
            <div className="kv"><span>Format checked</span><b>In the browser, before sending</b></div>
            <div className="card-note">
              Accepted languages: {ALLOWED_LANGUAGES.join(', ')}. Keep the title between{' '}
              {LIMITS.titleMin} and {LIMITS.titleMax} characters, the code under{' '}
              {LIMITS.codeMax} characters, the description under {LIMITS.descriptionMax}, and
              use at most {LIMITS.maxTags} tags of {LIMITS.tagMax} characters each.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CodeSubmissionPage;
