import { fireEvent, render, screen } from '@testing-library/react';
import DatasetsPanel from '../components/developer/DatasetsPanel';
import { downloadDatasetExport } from '../api/client';

jest.mock('../api/client', () => ({ downloadDatasetExport: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test('downloads the selected dataset, season and format', async () => {
  const blob = { text: async () => '[{"season":2025}]' };
  downloadDatasetExport.mockResolvedValue(blob);
  URL.createObjectURL = jest.fn(() => 'blob:export');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<DatasetsPanel />);
  fireEvent.change(screen.getByLabelText('Dataset'), { target: { value: 'driver-season-stats' } });
  fireEvent.change(screen.getByLabelText('Season (optional)'), { target: { value: '2025' } });
  fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'json' } });
  fireEvent.click(screen.getByRole('button', { name: 'Download export' }));
  expect(screen.getByRole('button', { name: 'Preparing export…' })).toBeDisabled();
  expect(await screen.findByRole('status')).toHaveTextContent('downloaded');
  expect(downloadDatasetExport).toHaveBeenCalledWith({ dataset: 'driver-season-stats', season: '2025', format: 'json' });
  expect(click).toHaveBeenCalledTimes(1);
  expect(click.mock.instances[0].download).toBe('driver-season-stats-2025.json');
  click.mockRestore();
});

test.each([['csv', 'id,season\n'], ['json', '[]']])('handles empty %s exports', async (format, contents) => {
  downloadDatasetExport.mockResolvedValue({ text: async () => contents });
  render(<DatasetsPanel />);
  fireEvent.change(screen.getByLabelText('Format'), { target: { value: format } });
  fireEvent.click(screen.getByRole('button', { name: 'Download export' }));
  expect(await screen.findByRole('status')).toHaveTextContent('No records match');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test('shows backend errors and allows another attempt', async () => {
  downloadDatasetExport.mockRejectedValueOnce({ body: { error: 'Too many requests' } });
  downloadDatasetExport.mockResolvedValueOnce({ text: async () => 'id,season\n' });
  render(<DatasetsPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Download export' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
  fireEvent.click(screen.getByRole('button', { name: 'Download export' }));
  expect(await screen.findByRole('status')).toHaveTextContent('No records match');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
