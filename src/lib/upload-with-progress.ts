/**
 * PUT a blob/file directly to a Supabase Storage signed upload URL,
 * reporting progress. Compartido entre PhotosTab y DocumentsTab (antes
 * duplicado casi verbatim en ambos).
 */
export function uploadWithProgress(
  url: string,
  blob: Blob | File,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network error"));
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(blob);
  });
}
