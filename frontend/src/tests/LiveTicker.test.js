import { act, render, screen } from '@testing-library/react';
import LiveTicker from '../components/telemetry-tv/LiveTicker';

describe('LiveTicker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('advances through each insight once and leaves the last one visible', () => {
    render(
      <LiveTicker
        events={[
          { description: 'Closest battle: Driver A is under pressure.' },
          { description: 'Driver B gained two positions.' },
        ]}
      />
    );

    expect(screen.getByText('Closest battle: Driver A is under pressure.')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(6000);
    });
    expect(screen.getByText('Driver B gained two positions.')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(18000);
    });
    expect(screen.getByText('Driver B gained two positions.')).toBeInTheDocument();
    expect(screen.queryByText('Closest battle: Driver A is under pressure.')).not.toBeInTheDocument();
  });
});