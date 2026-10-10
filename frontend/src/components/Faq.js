import { useState } from 'react';

// Keep these answers true to how the site works today: data arrives when a
// finished session is synced, and nothing is a live feed.
const FAQS = [
  {
    q: 'What is F1Lytics?',
    a: 'A Formula 1 analytics site. Race data is stored as a log of individual events — laps, pit stops, position changes, results — and every statistic is calculated from that log rather than typed in by hand.',
  },
  {
    q: 'How current is the data?',
    a: 'A session is added after it has finished, when its data is synced from OpenF1. The pages show it within about a minute of the sync. Nothing on the site is a live feed.',
  },
  {
    q: 'Do I need an account to use it?',
    a: 'No. Overview, Fixtures & Events, Statistics, Time-Travel, Race Replay, Drivers, Teams and Telemetry TV are open to everyone. With an account you can follow drivers and teams and get notifications about them. Developers with a verified email can turn on developer mode in Profile → Settings to submit datasets and code for an admin to review.',
  },
  {
    q: 'What is Time-Travel?',
    a: 'It shows how one driver\'s result in a session changed as data was added and corrected over time, and lets you compare that result at two points in its history.',
  },
  {
    q: 'Where does the data come from?',
    a: 'Race data comes from the OpenF1 API, plus datasets submitted by developers once an admin has accepted them. News comes from BBC Sport and ESPN, videos from the official Formula 1 YouTube channel, and some driver and team profile details from API-Sports.',
  },
];

function Faq() {
  const [open, setOpen] = useState(new Set());

  const toggle = (index) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <section className="faq-section">
      <div className="page">
        <div className="section-head">
          <div className="tag">FAQ</div>
          <h2 className="section-title">Frequently asked questions</h2>
        </div>
        <div className="faq-list">
          {FAQS.map((item, index) => {
            const isOpen = open.has(index);
            return (
              <div key={index} className="faq-item">
                <button
                  type="button"
                  className="faq-q"
                  onClick={() => toggle(index)}
                  aria-expanded={isOpen}
                >
                  {item.q}
                  <span className="chev" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && <p className="faq-a">{item.a}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Faq;
