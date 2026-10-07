import { useEffect, useMemo, useState } from 'react';
import useF1NewsFeed from '../../hooks/useF1NewsFeed';
import { filterNewsItems } from '../../services/newsFiltering';

const FILTERS = [
  ['latest', 'Latest'],
  ['for-you', 'For You'],
  ['drivers', 'Drivers'],
  ['teams', 'Teams'],
];
const INITIAL_STORY_COUNT = 10;
const STORY_BATCH_SIZE = 10;

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

function NewsFeedPanel({ preferences, catalog }) {
  const {
    items,
    loading,
    error,
    connection,
    lastUpdated,
    newItemIds,
    loadingMore,
    refresh,
    loadMore,
  } = useF1NewsFeed();
  const [activeFilter, setActiveFilter] = useState('latest');
  const [visibleCount, setVisibleCount] = useState(INITIAL_STORY_COUNT);
  useEffect(() => {
    setVisibleCount(INITIAL_STORY_COUNT);
  }, [activeFilter]);

  const hasPreferences = Boolean(
    preferences?.followedDriverIds?.length
    || preferences?.followedTeamIds?.length
  );
  const matchedItems = useMemo(
    () => filterNewsItems(items, activeFilter, preferences, catalog),
    [activeFilter, catalog, items, preferences]
  );
  const isForYouFallback = activeFilter === 'for-you'
    && hasPreferences
    && items.length > 0
    && matchedItems.length === 0;
  const visibleItems = isForYouFallback ? items : matchedItems;
  const displayedItems = visibleItems.slice(0, visibleCount);
  const featured = displayedItems[0];
  const remaining = displayedItems.slice(1);
  const hasMoreStories = displayedItems.length < visibleItems.length;
  const connectionLabel = {
    live: 'Listening for new stories',
    connecting: 'Connecting to live updates',
    reconnecting: 'Reconnecting to live updates',
    unsupported: 'Manual refresh mode',
  }[connection];

  const handleLoadMore = async () => {
    await loadMore();
    setVisibleCount((count) => count + STORY_BATCH_SIZE);
  };

  return (
    <section className="news-content profile-news-feed" aria-label="Formula 1 news feed">
      <div className="news-tab-heading">
        <div>
          <div className="section-eyebrow">F1 newsroom</div>
          <h1>Latest Formula 1 news</h1>
        </div>
        <p>Fresh headlines are checked automatically every 10 minutes.</p>
      </div>

      <div className="news-filterbar" role="tablist" aria-label="Filter Formula 1 news">
        {FILTERS.map(([value, label]) => (
          <button
            className={`news-filter${activeFilter === value ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeFilter === value}
            onClick={() => setActiveFilter(value)}
            key={value}
          >
            {label}
          </button>
        ))}
      </div>

      {activeFilter === 'for-you' && !hasPreferences && (
        <div className="news-preference-hint" role="status">
          Follow drivers or teams from their pages to personalise this feed.
          Showing Latest for now.
        </div>
      )}

      {isForYouFallback && (
        <div className="news-preference-hint" role="status">
          No recent stories mention the drivers or teams you follow.
          Showing the latest Formula 1 news instead.
        </div>
      )}

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

      {!loading && items.length > 0 && visibleItems.length === 0 && (
        <div className="card news-empty">
          <div className="card-title">No matching stories right now</div>
          <p>Try another filter or follow more drivers and teams from their pages.</p>
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
            <span className="news-read-link">Read full story at {featured.source} <b aria-hidden="true">→</b></span>
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
              <span>{visibleItems.length} headlines</span>
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

      {hasMoreStories && (
        <div className="news-load-more">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Checking for stories…' : 'Load more stories'}
          </button>
          <span>Showing {displayedItems.length} of {visibleItems.length}</span>
        </div>
      )}

      <p className="news-attribution">
        Headlines and summaries provided by ESPN and BBC Sport. Each story opens on the publisher's site.
      </p>
    </section>
  );
}

export default NewsFeedPanel;
