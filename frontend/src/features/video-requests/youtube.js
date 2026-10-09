/**
 * Reads a YouTube video ID out of whatever a user pastes: a watch link, a
 * youtu.be short link, an embed URL, a Shorts or live link, the full
 * <iframe> embed code, or the bare 11-character ID. Returns null for
 * anything that isn't recognisably a YouTube video.
 *
 * The same rules as the server's (backend src/lib/youtube.js), so the
 * form can preview the video before it is sent. The server re-checks: its
 * copy is the one that counts.
 */

const ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);

export function parseYouTubeId(input) {
  let text = String(input ?? '').trim();
  if (!text) return null;
  if (ID.test(text)) return text;

  // Embed code: take the iframe's src.
  const src = text.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (src) text = src[1];
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  let candidate = null;
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1];
  } else if (url.pathname === '/watch') {
    candidate = url.searchParams.get('v');
  } else {
    const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
    candidate = match?.[1] ?? null;
  }
  return candidate && ID.test(candidate) ? candidate : null;
}
