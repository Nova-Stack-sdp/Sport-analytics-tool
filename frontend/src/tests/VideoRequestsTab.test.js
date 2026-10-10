import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VideoRequestsTab from '../components/admin/VideoRequestsTab';
import { getVideoRequests, reviewVideoRequest } from '../api/client';

jest.mock('../api/client', () => ({
  getVideoRequests: jest.fn(),
  reviewVideoRequest: jest.fn(),
}));

const PENDING = [
  {
    id: 'vr-1',
    raceName: 'Indy Toronto 2024',
    youtubeId: 'UO4c-wMLhso',
    notes: 'Race starts at 12:40',
    userEmail: 'fan@example.com',
    status: 'pending',
    createdAt: '2026-10-09T10:00:00Z',
  },
  {
    id: 'vr-2',
    raceName: 'Long Beach 2024',
    youtubeId: null,
    hostedDescription: 'INDYCAR channel, full race, April 2024',
    userEmail: 'other@example.com',
    status: 'pending',
    createdAt: '2026-10-09T11:00:00Z',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  getVideoRequests.mockResolvedValue({ requests: PENDING });
});

const row = (race) => screen.getAllByRole('row').find((tr) => within(tr).queryByText(race));

test('lists the pending requests with the video to check and who sent it', async () => {
  render(<VideoRequestsTab />);
  expect(await screen.findByText('Indy Toronto 2024')).toBeInTheDocument();
  expect(getVideoRequests).toHaveBeenCalledWith('pending');
  expect(within(row('Indy Toronto 2024')).getByRole('link')).toHaveAttribute(
    'href',
    'https://www.youtube.com/watch?v=UO4c-wMLhso'
  );
  expect(within(row('Long Beach 2024')).getByText('INDYCAR channel, full race, April 2024')).toBeInTheDocument();
  expect(within(row('Long Beach 2024')).getByText('other@example.com')).toBeInTheDocument();
});

test('approving clears the request from the queue', async () => {
  reviewVideoRequest.mockResolvedValue({ request: { ...PENDING[0], status: 'approved' } });
  render(<VideoRequestsTab />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve Indy Toronto 2024' }));
  expect(reviewVideoRequest).toHaveBeenCalledWith('vr-1', { status: 'approved', reviewNote: undefined });
  await screen.findByText('Long Beach 2024');
  expect(await screen.findByRole('button', { name: 'Approve Long Beach 2024' })).toBeInTheDocument();
  expect(screen.queryByText('Indy Toronto 2024')).not.toBeInTheDocument();
});

test('rejecting needs the reason the user will be told', async () => {
  reviewVideoRequest.mockResolvedValue({ request: { ...PENDING[1], status: 'rejected' } });
  render(<VideoRequestsTab />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reject Long Beach 2024' }));
  const send = screen.getByRole('button', { name: 'Reject and notify' });
  expect(send).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Reason for rejecting Long Beach 2024'), {
    target: { value: 'Blocked for copyright in most regions.' },
  });
  fireEvent.click(send);
  expect(reviewVideoRequest).toHaveBeenCalledWith('vr-2', {
    status: 'rejected',
    reviewNote: 'Blocked for copyright in most regions.',
  });
  await waitFor(() => expect(screen.queryByText('Long Beach 2024')).not.toBeInTheDocument());
});

test('the other statuses are a tab away', async () => {
  render(<VideoRequestsTab />);
  await screen.findByText('Indy Toronto 2024');
  getVideoRequests.mockResolvedValue({ requests: [] });
  fireEvent.click(screen.getByRole('tab', { name: 'Approved' }));
  expect(await screen.findByText('No approved requests.')).toBeInTheDocument();
  expect(getVideoRequests).toHaveBeenLastCalledWith('approved');
});
