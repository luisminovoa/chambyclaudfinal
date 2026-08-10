import type { ProfilePhoto } from "@/lib/types";

/**
 * Galería de fotos profesionales — reutiliza profile_photos.public_url
 * (mismo campo que WorkerPublicProfileView), sin bucket ni tabla nueva.
 * Solo se renderiza cuando hay fotos (la página que la usa ya filtra
 * `photos.length > 0`).
 */
export function AdminProfilePhotos({ photos }: { photos: ProfilePhoto[] }) {
  return (
    <div className="card p-5">
      <h2 className="mb-3 text-sm font-bold text-ink">Fotos del perfil</h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((photo) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.id}
            src={photo.public_url}
            alt=""
            className="aspect-square w-full rounded-2xl object-cover"
          />
        ))}
      </div>
    </div>
  );
}
