import { act, render, screen, within } from '@testing-library/react';
import LiveTicker from '../components/telemetry-tv/LiveTicker';
import { dwellMs } from '../features/telemetry-tv/narrator';

const pass = {
  id: 'pass',
  type: 'overtake',
  at: 100,
  text: 'Herta moves ahead of Palou for P2.',
  drivers: ['Herta', 'Palou'],
};
const stop = { id: 'stop', type: 'pit_stop', at: 101, text: 'Pit stop: Rossi stops.' };
const crash = {
  id: 'crash',
  type: 'crash',
  at: 104,
  text: 'Crash at turn 3: Ericsson into the wall.',
  drivers: ['Ericsson'],
};

const commentary = () => screen.getByRole('region', { name: 'Live commentary' });

describe('LiveTicker — the narrator crawl', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('is a plain strip, not a <section> the site stylesheet would pad shut', () => {
    // globals.css pads every <section> 64px top and bottom; inside a 38px
    // strip that collapsed the line's track and hid what was being said.
    render(<LiveTicker candidates={[pass]} now={102} />);
    expect(commentary().tagName).toBe('DIV');
  });

  test('waits quietly with nothing to say', () => {
    render(<LiveTicker candidates={[]} now={10} label="LAP 1" />);
    expect(within(commentary()).getByText('Awaiting commentary…')).toBeInTheDocument();
    expect(within(commentary()).getByText('LAP 1')).toBeInTheDocument();
  });

  test('airs the most important moment first, tagged, with its drivers in bold', () => {
    render(<LiveTicker candidates={[stop, pass]} now={102} />);
    expect(commentary()).toHaveAttribute('data-tier', 'major');
    expect(within(commentary()).getByText('Overtake')).toBeInTheDocument();
    expect(within(commentary()).getByText('Herta', { selector: 'strong' })).toBeInTheDocument();
    expect(within(commentary()).getByText('Palou', { selector: 'strong' })).toBeInTheDocument();
    expect(commentary()).toHaveTextContent('Herta moves ahead of Palou for P2.');
  });

  test('hands over to the next moment once the line has had its air time', () => {
    render(<LiveTicker candidates={[stop, pass]} now={102} />);
    act(() => {
      jest.advanceTimersByTime(dwellMs(pass.text) + 500);
    });
    expect(within(commentary()).getByText('Pit lane')).toBeInTheDocument();
    expect(commentary()).toHaveTextContent('Pit stop: Rossi stops.');
  });

  test('a crash cuts straight in, bold, under a BREAKING tag', () => {
    const { rerender } = render(<LiveTicker candidates={[pass]} now={102} />);
    rerender(<LiveTicker candidates={[pass, crash]} now={104} />);
    expect(commentary()).toHaveAttribute('data-tier', 'breaking');
    expect(commentary()).toHaveClass('is-breaking');
    expect(within(commentary()).getByText('Breaking')).toBeInTheDocument();
    expect(within(commentary()).getByText('Incident')).toBeInTheDocument();
    expect(commentary()).toHaveTextContent('Crash at turn 3: Ericsson into the wall.');
  });
});
