import { fireEvent, render, screen } from '@testing-library/react';
import TelemetryTVPage from '../pages/TelemetryTVPage';
import { getTelemetryTVRaces } from '../api/client';

jest.mock('../api/client', () => ({
  getTelemetryTVRaces: jest.fn(),
}));

const RACES = [
  {
    slug: 'toronto-2025',
    eventName: 'Ontario Honda Dealers Indy Toronto',
    sessionDate: '7/20/2025',
    totalLaps: 90,
    fieldSize: 27,
    video: { youtubeId: 'UO4c-wMLhso', embedStartSeconds: 184, videoDurationSeconds: 7759 },
  },
  {
    slug: 'indianapolis-500-2024',
    eventName: '108th Running of the Indianapolis 500',
    sessionDate: '5/26/2024',
    totalLaps: 200,
    fieldSize: 33,
    video: { youtubeId: 'fWwonhySrWg', embedStartSeconds: 10353, videoDurationSeconds: 20625 },
  },
];

beforeEach(() => {
  getTelemetryTVRaces.mockReset();
});

describe('TelemetryTVPage', () => {
  test('loads the race catalogue and embeds the newest race video', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    render(<TelemetryTVPage />);

    const iframe = await screen.findByTitle('YouTube video player');
    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/UO4c-wMLhso?enablejsapi=1&playsinline=1&start=184'
    );
    expect(screen.getByLabelText('Choose a race')).toHaveValue('toronto-2025');
    expect(screen.getByLabelText('Choose a race').closest('.video-panel')).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Ontario Honda Dealers Indy Toronto · 2025' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Telemetry feed not configured.', { selector: '.masterboard-empty-state' })
    ).toBeInTheDocument();
  });

  test('switching races in the dropdown swaps the embedded video', async () => {
    getTelemetryTVRaces.mockResolvedValue({ races: RACES });
    render(<TelemetryTVPage />);

    await screen.findByTitle('YouTube video player');
    fireEvent.change(screen.getByLabelText('Choose a race'), {
      target: { value: 'indianapolis-500-2024' },
    });

    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/fWwonhySrWg?enablejsapi=1&playsinline=1&start=10353'
    );
    expect(screen.getByText('108th Running of the Indianapolis 500')).toBeInTheDocument();
  });

  test('shows the unconfigured shell when the catalogue fails to load', async () => {
    getTelemetryTVRaces.mockRejectedValue(
      new Error('Request to /api/telemetry-tv/races failed with status 500')
    );
    render(<TelemetryTVPage />);

    expect(
      await screen.findByText('Request to /api/telemetry-tv/races failed with status 500')
    ).toBeInTheDocument();
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument();
    expect(screen.getByText('No video source configured')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose a race')).toHaveValue('');
  });
});
