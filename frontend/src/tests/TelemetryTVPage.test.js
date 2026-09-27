import { fireEvent, render, screen } from '@testing-library/react';
import TelemetryTVPage from '../pages/TelemetryTVPage';

describe('TelemetryTVPage', () => {
  test('keeps the dashboard shell with no configured video or telemetry feed', () => {
    render(<TelemetryTVPage />);

    expect(screen.getByText('Video source not configured')).toBeInTheDocument();
    expect(screen.getByText('Telemetry feed not configured.', { selector: '.masterboard-empty-state' })).toBeInTheDocument();
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument();
  });

  test('keeps setup controls available for the next feed', () => {
    render(<TelemetryTVPage />);
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '2024' } });
    fireEvent.change(screen.getByLabelText('Grand Prix name contains'), { target: { value: 'Monaco' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find race' }));
    expect(screen.getByLabelText('Season')).toHaveValue(2024);
    expect(screen.getByLabelText('Grand Prix name contains')).toHaveValue('Monaco');
  });
});