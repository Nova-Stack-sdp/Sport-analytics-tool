import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VideoRequestCard from '../components/telemetry-tv/VideoRequestCard';
import { submitVideoRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { parseYouTubeId } from '../features/video-requests/youtube';

jest.mock('../api/client', () => ({ submitVideoRequest: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const renderCard = (onClose = jest.fn()) => {
  render(
    <MemoryRouter>
      <VideoRequestCard onClose={onClose} />
    </MemoryRouter>
  );
  return { onClose };
};

const field = (name) => screen.getByLabelText(name);
const send = () => screen.getByRole('button', { name: 'Send for review' });

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { uid: 'fan-uid' } });
});

test('leads with the copyright policy: checked first, a few hours, a notification', () => {
  renderCard();
  const policy = screen.getByRole('note');
  expect(policy).toHaveTextContent('We are strict about copyright.');
  expect(policy).toHaveTextContent("isn't copyright-blocked");
  expect(policy).toHaveTextContent('a few hours');
  expect(policy).toHaveTextContent("you'll get a notification as soon as your video is live");
});

test('a signed-out viewer is asked to sign in, so they can be notified', () => {
  useAuth.mockReturnValue({ user: null });
  renderCard();
  expect(screen.getByText(/we need to know who to notify/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
  expect(screen.queryByRole('button', { name: 'Send for review' })).not.toBeInTheDocument();
});

test('a pasted embed code is read and the video previewed', () => {
  renderCard();
  fireEvent.change(field('YouTube link or embed code'), {
    target: { value: '<iframe src="https://www.youtube.com/embed/UO4c-wMLhso" allowfullscreen></iframe>' },
  });
  expect(screen.getByText('Video found')).toBeInTheDocument();
  expect(screen.getByText('ID UO4c-wMLhso')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Preview of the linked YouTube video' })).toHaveAttribute(
    'src',
    'https://i.ytimg.com/vi/UO4c-wMLhso/mqdefault.jpg'
  );
});

test('a link that is not a YouTube video says so and cannot be sent', () => {
  renderCard();
  fireEvent.change(field('Race'), { target: { value: 'Indy Toronto 2024' } });
  fireEvent.change(field('YouTube link or embed code'), { target: { value: 'https://vimeo.com/123' } });
  fireEvent.click(screen.getByRole('checkbox'));
  expect(field('YouTube link or embed code')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByText(/doesn't look like a YouTube video link/)).toBeInTheDocument();
  expect(send()).toBeDisabled();
});

test('it can be sent once it names the race, says where the video is, and the policy is accepted', async () => {
  submitVideoRequest.mockResolvedValue({ request: { id: 'vr-1', raceName: 'Indy Toronto 2024' } });
  renderCard();
  expect(send()).toBeDisabled();
  fireEvent.change(field('Race'), { target: { value: 'Indy Toronto 2024' } });
  expect(screen.getByText('Add a YouTube link, or say where the video is hosted.')).toBeInTheDocument();
  fireEvent.change(field('Where is it hosted on YouTube?'), {
    target: { value: 'INDYCAR channel, "Full Race | 2024 Honda Indy Toronto", July 2024' },
  });
  expect(send()).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(send()).toBeEnabled();

  fireEvent.click(send());
  expect(submitVideoRequest).toHaveBeenCalledWith({
    raceName: 'Indy Toronto 2024',
    videoUrl: undefined,
    hostedDescription: 'INDYCAR channel, "Full Race | 2024 Honda Indy Toronto", July 2024',
    notes: undefined,
  });
  const done = await screen.findByRole('status');
  expect(done).toHaveTextContent('Request received');
  expect(done).toHaveTextContent('Indy Toronto 2024 is in our copyright review');
  expect(done).toHaveTextContent("We'll notify you when it's live on Telemetry TV.");
});

test("the server's reason is shown when a request is refused", async () => {
  submitVideoRequest.mockRejectedValue(
    Object.assign(new Error('429'), {
      status: 429,
      body: { error: "You already have 5 videos waiting for review. We'll notify you as each one is checked." },
    })
  );
  renderCard();
  fireEvent.change(field('Race'), { target: { value: 'X' } });
  fireEvent.change(field('YouTube link or embed code'), { target: { value: 'https://youtu.be/UO4c-wMLhso' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(send());
  expect(await screen.findByRole('alert')).toHaveTextContent('You already have 5 videos waiting for review.');
});

test('the form reads YouTube links the way the server does', () => {
  expect(parseYouTubeId('https://www.youtube.com/watch?v=UO4c-wMLhso&t=5')).toBe('UO4c-wMLhso');
  expect(parseYouTubeId('https://youtu.be/UO4c-wMLhso')).toBe('UO4c-wMLhso');
  expect(parseYouTubeId('https://www.youtube.com/shorts/UO4c-wMLhso')).toBe('UO4c-wMLhso');
  expect(parseYouTubeId('https://evil.example/watch?v=UO4c-wMLhso')).toBeNull();
});
