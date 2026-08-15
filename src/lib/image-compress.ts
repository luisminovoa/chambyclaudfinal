/**
 * Compresión de imágenes en el navegador antes de subir — compartida
 * entre PhotosTab (galería de fotos del trabajador) y
 * EmployerLogoUpload (foto/logo del empleador) para no duplicar la
 * misma lógica de canvas/resize en ambos.
 */
export async function compressImage(file: File, maxPx = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx) {
        height = Math.round((height * maxPx) / width);
        width = maxPx;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("compress failed"))),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => reject(new Error("load failed"));
    img.src = url;
  });
}
