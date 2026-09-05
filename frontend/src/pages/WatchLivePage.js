function WatchLivePage() {
  return (
    <div className="page" id="page-watch-live">
      <div className="pagehead">
      <div className="section-eyebrow">Live</div>
      <div className="section-title">Watch Live</div>
        <div className="section-desc">
            <h1>Watch Live</h1>
          <p>Follow the session as it happens</p>
        </div>

      </div>


      <div className="content">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="video-embed">
            <iframe
              src="https://www.youtube.com/embed/O3oYzBXzAIs?si=LDYbi9zAYU7namuA&start=5"
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default WatchLivePage;
