/** Saves `text` as a file through the browser's download (no network involved). */
export function downloadText(text: string, fileName: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the click has been handled: some browsers cancel the download otherwise.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
