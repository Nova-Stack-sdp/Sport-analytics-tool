// Small SVG flags for the countries the app can currently place on a map —
// the circuits with a real generated track shape (see
// backend/src/data/track-shapes). Simple geometries (bands, crosses, circles)
// are drawn out in full; countries whose emblem can't honestly be reduced to
// a handful of shapes fall back to a neutral code plate instead, so the
// header never shows a wrong flag.

const FLAG_KEY_BY_COUNTRY = {
  italy: 'italy',
  netherlands: 'netherlands',
  austria: 'austria',
  hungary: 'hungary',
  belgium: 'belgium',
  spain: 'spain',
  monaco: 'monaco',
  japan: 'japan',
  uae: 'uae',
  'united arab emirates': 'uae',
  bahrain: 'bahrain',
  qatar: 'qatar',
  singapore: 'singapore',
  usa: 'usa',
  'united states': 'usa',
  'united states of america': 'usa',
  uk: 'uk',
  'united kingdom': 'uk',
  'great britain': 'uk',
  azerbaijan: 'azerbaijan',
  brazil: 'brazil',
};

const FLAG_ART = {
  italy: (
    <>
      <rect width="16" height="32" fill="#009246" />
      <rect x="16" width="16" height="32" fill="#ffffff" />
      <rect x="32" width="16" height="32" fill="#ce2b37" />
    </>
  ),
  netherlands: (
    <>
      <rect width="48" height="10.7" fill="#ae1c28" />
      <rect y="10.7" width="48" height="10.6" fill="#ffffff" />
      <rect y="21.3" width="48" height="10.7" fill="#21468b" />
    </>
  ),
  austria: (
    <>
      <rect width="48" height="10.7" fill="#ed2939" />
      <rect y="10.7" width="48" height="10.6" fill="#ffffff" />
      <rect y="21.3" width="48" height="10.7" fill="#ed2939" />
    </>
  ),
  hungary: (
    <>
      <rect width="48" height="10.7" fill="#ce2939" />
      <rect y="10.7" width="48" height="10.6" fill="#ffffff" />
      <rect y="21.3" width="48" height="10.7" fill="#477050" />
    </>
  ),
  belgium: (
    <>
      <rect width="16" height="32" fill="#000000" />
      <rect x="16" width="16" height="32" fill="#fdda24" />
      <rect x="32" width="16" height="32" fill="#ef3340" />
    </>
  ),
  spain: (
    <>
      <rect width="48" height="8" fill="#aa151b" />
      <rect y="8" width="48" height="16" fill="#f1bf00" />
      <rect y="24" width="48" height="8" fill="#aa151b" />
    </>
  ),
  monaco: (
    <>
      <rect width="48" height="16" fill="#ce1126" />
      <rect y="16" width="48" height="16" fill="#ffffff" />
    </>
  ),
  japan: (
    <>
      <rect width="48" height="32" fill="#ffffff" />
      <circle cx="24" cy="16" r="9.6" fill="#bc002d" />
    </>
  ),
  uae: (
    <>
      <rect width="48" height="10.7" fill="#00732f" />
      <rect y="10.7" width="48" height="10.6" fill="#ffffff" />
      <rect y="21.3" width="48" height="10.7" fill="#000000" />
      <rect width="12" height="32" fill="#ff0000" />
    </>
  ),
  // Five white points against the red field.
  bahrain: (
    <>
      <rect width="48" height="32" fill="#ffffff" />
      <path
        d="M16 0 L8 3.2 L16 6.4 L8 9.6 L16 12.8 L8 16 L16 19.2 L8 22.4 L16 25.6 L8 28.8 L16 32 H48 V0 Z"
        fill="#ce1126"
      />
    </>
  ),
  // Nine white points, as Qatar's serration actually is.
  qatar: (
    <>
      <rect width="48" height="32" fill="#ffffff" />
      <path
        d="M16 0 L8 1.8 L16 5.3 L8 8.9 L16 12.4 L8 16 L16 19.6 L8 23.1 L16 26.7 L8 30.2 L16 32 H48 V0 Z"
        fill="#8a1538"
      />
    </>
  ),
  singapore: (
    <>
      <rect width="48" height="16" fill="#ef3340" />
      <rect y="16" width="48" height="16" fill="#ffffff" />
      <circle cx="12.5" cy="7.4" r="5" fill="#ffffff" />
      <circle cx="14.6" cy="7.4" r="4.6" fill="#ef3340" />
      <circle cx="25.4" cy="7.4" r="1.1" fill="#ffffff" />
      <circle cx="23.1" cy="10.6" r="1.1" fill="#ffffff" />
      <circle cx="19.3" cy="9.4" r="1.1" fill="#ffffff" />
      <circle cx="19.3" cy="5.4" r="1.1" fill="#ffffff" />
      <circle cx="23.1" cy="4.2" r="1.1" fill="#ffffff" />
    </>
  ),
  usa: (
    <>
      <rect width="48" height="32" fill="#ffffff" />
      <rect width="48" height="2.5" fill="#b31942" />
      <rect y="4.9" width="48" height="2.5" fill="#b31942" />
      <rect y="9.8" width="48" height="2.5" fill="#b31942" />
      <rect y="14.8" width="48" height="2.5" fill="#b31942" />
      <rect y="19.7" width="48" height="2.5" fill="#b31942" />
      <rect y="24.6" width="48" height="2.5" fill="#b31942" />
      <rect y="29.5" width="48" height="2.5" fill="#b31942" />
      <rect width="19.2" height="17.2" fill="#3c3b6e" />
      <circle cx="3.6" cy="3.4" r="0.95" fill="#ffffff" />
      <circle cx="9.6" cy="3.4" r="0.95" fill="#ffffff" />
      <circle cx="15.6" cy="3.4" r="0.95" fill="#ffffff" />
      <circle cx="3.6" cy="8.6" r="0.95" fill="#ffffff" />
      <circle cx="9.6" cy="8.6" r="0.95" fill="#ffffff" />
      <circle cx="15.6" cy="8.6" r="0.95" fill="#ffffff" />
      <circle cx="3.6" cy="13.8" r="0.95" fill="#ffffff" />
      <circle cx="9.6" cy="13.8" r="0.95" fill="#ffffff" />
      <circle cx="15.6" cy="13.8" r="0.95" fill="#ffffff" />
    </>
  ),
  // The Union Jack, drawn in its actual construction (white saltire, red
  // saltire, white cross, red cross) over the blue field.
  uk: (
    <>
      <rect width="48" height="32" fill="#012169" />
      <path d="M0 0 L48 32" stroke="#ffffff" strokeWidth="6.4" />
      <path d="M48 0 L0 32" stroke="#ffffff" strokeWidth="6.4" />
      <path d="M0 0 L48 32" stroke="#c8102e" strokeWidth="2.6" />
      <path d="M48 0 L0 32" stroke="#c8102e" strokeWidth="2.6" />
      <rect x="18.7" width="10.6" height="32" fill="#ffffff" />
      <rect y="10.7" width="48" height="10.6" fill="#ffffff" />
      <rect x="21.3" width="5.4" height="32" fill="#c8102e" />
      <rect y="13.3" width="48" height="5.4" fill="#c8102e" />
    </>
  ),
  azerbaijan: (
    <>
      <rect width="48" height="10.7" fill="#00b5e2" />
      <rect y="10.7" width="48" height="10.6" fill="#ef3340" />
      <rect y="21.3" width="48" height="10.7" fill="#509e2f" />
      <circle cx="20" cy="16" r="4.6" fill="#ffffff" />
      <circle cx="21.8" cy="16" r="4.2" fill="#ef3340" />
      <circle cx="26.8" cy="16" r="1.3" fill="#ffffff" />
    </>
  ),
  brazil: (
    <>
      <rect width="48" height="32" fill="#009739" />
      <path d="M24 5 L43 16 L24 27 L5 16 Z" fill="#fedd00" />
      <circle cx="24" cy="16" r="6.6" fill="#012169" />
      <path d="M17.5 15.2 A6.6 6.6 0 0 0 30.5 15.2" stroke="#ffffff" strokeWidth="1.2" fill="none" />
    </>
  ),
};

// Recognisable short codes for countries that only get the plate.
const CODE_BY_COUNTRY = {
  canada: 'CAN',
  australia: 'AUS',
  mexico: 'MEX',
  'saudi arabia': 'SAU',
  china: 'CHN',
  france: 'FRA',
  germany: 'GER',
  portugal: 'POR',
  russia: 'RUS',
  turkey: 'TUR',
};

function RaceSyncFlag({ country, className }) {
  const name = String(country ?? '').trim();
  const key = FLAG_KEY_BY_COUNTRY[name.toLowerCase()];
  const art = key ? FLAG_ART[key] : null;

  if (!art) {
    const code =
      CODE_BY_COUNTRY[name.toLowerCase()] ||
      name.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() ||
      '—';
    return (
      <span className={`${className} racesync-flag-code`} aria-hidden="true">
        {code}
      </span>
    );
  }

  return (
    <svg className={className} viewBox="0 0 48 32" role="img" aria-label={name} focusable="false">
      {art}
    </svg>
  );
}

export default RaceSyncFlag;
