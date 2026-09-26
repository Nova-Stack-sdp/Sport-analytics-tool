import useF1NewsFeed from '../../hooks/useF1NewsFeed';

function timeAgo(value) {
  if (!value) return 'Recently';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function NewsImage({ article, featured = false }) {
  if (!article.imageUrl) {
    return (
      <div className={`news-image news-image-fallback${featured ? ' is-featured' : ''}`} aria-hidden="true">
        <span>F1</span>
      </div>
    );
  }
  return (
    <div className={`news-image${featured ? ' is-featured' : ''}`}>
      <img src={article.imageUrl} alt="" loading={featured ? 'eager' : 'lazy'} />
    </div>
  );
}

function StoryMeta({ article }) {
  return (
    <div className="news-meta">
      <span>{article.category || 'Formula 1'}</span>
      <span aria-hidden="true">•</span>
      <span>{timeAgo(article.publishedAt)}</span>
      <span aria-hidden="true">•</span>
      <span>{article.source}</span>
    </div>
  );
}

function NewsFeedPanel() {
  const {
    items,
    loading,
    error,
    connection,
    lastUpdated,
    newItemIds,
    refresh,
  } = useF1NewsFeed();
  const featured = items[0];
  const remaining = items.slice(1);
  const connectionLabel = {
    live: 'Listening for new stories',
    connecting: 'Connecting to live updates',
    reconnecting: 'Reconnecting to live updates',
    unsupported: 'Manual refresh mode',
  }[connection];

  return (
    <section className="news-content profile-news-feed" aria-label="Formula 1 news feed">
      <div className="news-tab-heading">
        <div>
          <div className="section-eyebrow">F1 newsroom</div>
          <h1>Latest Formula 1 news</h1>
        </div>
        <p>Fresh headlines arrive automatically while this tab is open.</p>
      </div>

      <div className="news-livebar" role="status">
        <span className={`news-live-dot is-${connection}`} aria-hidden="true" />
        <strong>{connectionLabel}</strong>
        <span className="news-live-note">
          {lastUpdated ? `Feed checked ${timeAgo(lastUpdated)}` : 'Waiting for the first feed check'}
        </span>
        <button className="btn btn-ghost btn-sm" type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>

      {error && (
        <div className="news-alert" role="alert">
          <strong>Live feed issue</strong>
          <span>{error} {items.length > 0 ? 'Showing the most recent cached stories.' : ''}</span>
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="news-skeleton-grid" aria-label="Loading Formula 1 news">
          {Array.from({ length: 5 }).map((_, index) => <div className="news-skeleton" key={index} />)}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="card news-empty">
          <div className="card-title">No stories available yet</div>
          <p>Keep this tab open and the live listener will add the next story automatically.</p>
        </div>
      )}

      {featured && (
        <a className="news-featured" href={featured.url} target="_blank" rel="noreferrer">
          <NewsImage article={featured} featured />
          <div className="news-featured-copy">
            <div className="news-kicker">Top story</div>
            <StoryMeta article={featured} />
            <h2>{featured.title}</h2>
            {featured.summary && <p>{featured.summary}</p>}
            <span className="news-read-link">Read full story at BBC Sport <b aria-hidden="true">→</b></span>
          </div>
        </a>
      )}

      {remaining.length > 0 && (
        <section aria-labelledby="news-latest-title">
          <div className="news-section-heading">
            <div>
              <div className="section-eyebrow">Rolling coverage</div>
              <h2 id="news-latest-title">Latest stories</h2>
            </div>
            <span>{items.length} headlines</span>
          </div>
          <div className="news-grid">
            {remaining.map((article) => (
              <a
                className={`news-card${newItemIds.includes(article.id) ? ' is-new' : ''}`}
                href={article.url}
                target="_blank"
                rel="noreferrer"
                key={article.id}
              >
                <NewsImage article={article} />
                <div className="news-card-copy">
                  {newItemIds.includes(article.id) && <span className="news-new-badge">New</span>}
                  <StoryMeta article={article} />
                  <h3>{article.title}</h3>
                  {article.summary && <p>{article.summary}</p>}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <p className="news-attribution">
        Headlines and summaries provided by BBC Sport. Each story opens on the publisher's site.
      </p>
    </section>
  );
}

export default NewsFeedPanel;
