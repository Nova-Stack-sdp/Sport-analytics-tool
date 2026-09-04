import { useState } from 'react';

const FAQS = [
  {
    q: 'What is Nova Stack?',
    a: 'A live analytics platform for Formula 1 — every stat is derived from real race event data rather than entered by hand.',
  },
  {
    q: 'How current is the data?',
    a: 'Overview and Fixtures update in near real time during a session. Statistics and Time-Travel reflect the latest completed data sync.',
  },
  {
    q: 'Do I need an account to use it?',
    a: 'No — Overview, Fixtures & Events, Statistics, and Time-Travel are open to everyone. Signing in unlocks Submissions, Datasets, and Developer tools.',
  },
  {
    q: 'What is Time-Travel?',
    a: 'It replays a session\'s standings and events as they looked at any chosen moment, using the changelog behind the data.',
  },
  {
    q: 'Where does the data come from?',
    a: 'Race and session data is synced from the OpenF1 API. See the Developer page for endpoint details once you\'re signed in.',
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
