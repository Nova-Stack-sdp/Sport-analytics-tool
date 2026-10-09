import { saveBlob, datasetFilename } from './download';

test('saveBlob clicks a temporary download link and releases the URL', () => {
  URL.createObjectURL = jest.fn(() => 'blob:x');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captured() {
    expect(this.download).toBe('file.json');
    expect(this.href).toBe('blob:x');
  });
  const blob = new Blob(['{}']);

  saveBlob(blob, 'file.json');

  expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  expect(click).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  expect(document.querySelector('a[download]')).toBeNull();
  click.mockRestore();
});

test('datasetFilename marks rebuilt downloads', () => {
  expect(datasetFilename('abc', 'original')).toBe('dataset-abc.json');
  expect(datasetFilename('abc', 'rebuilt')).toBe('dataset-abc-rebuilt.json');
});
