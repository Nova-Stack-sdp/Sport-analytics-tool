import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCachedImageUrl, getDriverImageUrl, getDrivers, uploadDriverImage } from '../api/client';
import { useAuth } from '../context/AuthContext';

const INITIAL_PAGE_SIZE = 8;
const PREFETCH_PAGE_SIZE = 100;

// Mirrors the backend's limits (see driverUploadedImage.js) so obvious
// problems are caught before the file is sent.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Runs background work as soon as the browser is idle, with a timer fallback
// for environments (older browsers, jsdom) without requestIdleCallback. The
// cancel handle is captured up front so cleanup still works if the global
// disappears before unmount (as happens between test hooks).
function scheduleIdle(callback) {
  if (typeof window.requestIdleCallback === 'function') {
    const cancel = window.cancelIdleCallback;
    const handle = window.requestIdleCallback(callback);
    return () => {
      if (typeof cancel === 'function') cancel(handle);
    };
  }
  const timer = setTimeout(callback, 200);
  return () => clearTimeout(timer);
}

// A photo someone uploaded always wins. After that: the Firestore-cached
// headshot, then the OpenF1 headshot, then the API-Sports fallback, and
// finally the bare race number.
function DriverPhoto({ driver, uploadedVersion }) {
  const [attempt, setAttempt] = useState(0);

  // The uploaded photo (stored in our own database) is tried first. Next is
  // the Firestore-cached copy (once a driver's detail page has been opened at
  // least once), served directly — no proxying needed, it's already ours and
  // immutable. Anything after that falls back to the live OpenF1/API-Sports
  // URLs via the caching image proxy, same as before.
  const srcs = [
    uploadedVersion ? getDriverImageUrl(driver.id, uploadedVersion) : null,
    driver.cachedImageUrl ? getDriverImageUrl(driver.id) : null,
    ...[driver.imageUrl, driver.fallbackImageUrl].filter(Boolean).map((url) => getCachedImageUrl(url)),
  ].filter(Boolean);

  if (attempt >= srcs.length) {
    return <span className="driver-num">{driver.number}</span>;
  }

  return (
    <img
      src={srcs[attempt]}
      alt={driver.name}
      onError={() => setAttempt((current) => current + 1)}
    />
  );
}

// Small button on each card that uploads a photo for that driver. It sits
// beside the card's link rather than inside it, so clicking it never
// navigates to the driver's page.
function DriverPhotoUpload({ driver, onUploaded }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const handleClick = () => {
    setMessage(null);
    // Uploading changes shared data, so it needs an account.
    if (!user) {
      navigate('/sign-in');
      return;
    }
    inputRef.current?.click();
  };

  const handleChange = async (event) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still fires onChange.
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setMessage('Use a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage('Image is too large (max 2 MB).');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const idToken = await user.getIdToken();
      const result = await uploadDriverImage(driver.id, file, idToken);
      onUploaded(driver.id, result.uploadedImageVersion);
    } catch (err) {
      setMessage(err.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="driver-upload">
      <button
        type="button"
        className="driver-upload-btn"
        onClick={handleClick}
        disabled={busy}
        aria-label={`Upload photo for ${driver.name}`}
      >
        {busy ? 'Uploading…' : 'Upload photo'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="driver-upload-input"
        data-testid={`upload-input-${driver.id}`}
        onChange={handleChange}
        hidden
      />
      {message && <div className="driver-upload-error" role="alert">{message}</div>}
    </div>
  );
}

function DriversPage() {
  const [uploadedVersions, setUploadedVersions] = useState({});
  const [firstPage, setFirstPage] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const prefetchStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getDrivers({ limit: INITIAL_PAGE_SIZE, offset: 0 })
      .then((result) => {
        if (!cancelled) setFirstPage(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const hasMore = Boolean(firstPage?.hasMore)
    || (firstPage?.total != null && firstPage.drivers.length < firstPage.total);

  // Prefetch the rest of the grid while the user scans the first cards, so
  // "View more" reveals instantly instead of triggering a fresh request.
  useEffect(() => {
    if (loading || error || !firstPage || !hasMore || prefetchStartedRef.current) {
      return undefined;
    }
    prefetchStartedRef.current = true;
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      getDrivers({ limit: PREFETCH_PAGE_SIZE, offset: firstPage.drivers.length })
        .then((result) => {
          if (!cancelled) setRemaining(result);
        })
        .catch(() => {
          // Best-effort: View more simply stays disabled if this fails.
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [loading, error, firstPage, hasMore]);

  const drivers = revealed
    ? [...(firstPage?.drivers ?? []), ...(remaining?.drivers ?? [])]
    : (firstPage?.drivers ?? []);
  const canReveal = Boolean(remaining?.drivers?.length);

  const handleUploaded = (driverId, version) => {
    setUploadedVersions((current) => ({ ...current, [driverId]: version }));
  };

  return (
    <div className="page page-drivers">
      <div className="pagehead">
        <div className="tag">Drivers' championship</div>
        <div className="section-title">Drivers</div>
        <div className="section-sub">
          Ranked by championship points, highest first. Click a driver for their full profile.
        </div>
      </div>
      <div className="content">
        {loading && <p className="secondary">Loading drivers…</p>}
        {error && (
          <div className="rationale">
            <span className="ic">⚠</span>
            <div><b>Couldn't load drivers:</b> {error}</div>
          </div>
        )}
        {!loading && !error && drivers.length === 0 && (
          <p className="secondary">No drivers available yet.</p>
        )}
        {!loading && !error && drivers.length > 0 && (
          <div className="driver-grid">
            {drivers.map((driver, index) => {
              // A photo uploaded in this session beats what the API returned.
              const uploadedVersion = uploadedVersions[driver.id] ?? driver.uploadedImageVersion ?? null;
              return (
                <div key={driver.id} className="driver-cell-wrap">
                  <Link
                    to={`/driver/${driver.id}`}
                    className="driver-cell"
                    style={{ '--tc': driver.teamColor }}
                  >
                    <div className="driver-photo">
                      <span className="driver-rank">{index + 1}</span>
                      <DriverPhoto key={uploadedVersion ?? 'remote'} driver={driver} uploadedVersion={uploadedVersion} />
                    </div>
                    <div className="driver-strip">
                      <div>
                        <div className="driver-name">{driver.name}</div>
                        <div className="driver-team">{driver.teamName}</div>
                      </div>
                      <span className="flag">{driver.flag}</span>
                    </div>
                  </Link>
                  <DriverPhotoUpload driver={driver} onUploaded={handleUploaded} />
                </div>
              );
            })}
            {hasMore && !revealed && (
              <button
                type="button"
                className="view-more-btn"
                disabled={!canReveal}
                onClick={() => setRevealed(true)}
              >
                View more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DriversPage;
