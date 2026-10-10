// Saves a Blob in the browser through a temporary link; the object URL is
// released straight away.
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// File name for a dataset download from the admin API.
export function datasetFilename(id, kind) {
  return kind === 'rebuilt' ? `dataset-${id}-rebuilt.json` : `dataset-${id}.json`;
}
