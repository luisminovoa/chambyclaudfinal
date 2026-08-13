"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toaster";
import { compressImage } from "@/lib/image-compress";
import { uploadWithProgress } from "@/lib/upload-with-progress";
import { createPhotoUploadUrl, saveProfilePhoto, deleteProfilePhoto } from "@/lib/actions/profile";
import type { Profile, ProfilePhoto } from "@/lib/types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface EmployerLogoUploadProps {
  profile: Profile;
  initialPhoto: ProfilePhoto | null;
  onPhotoChange: (photo: ProfilePhoto | null) => void;
}

/**
 * Foto/logo del empleador — a diferencia de PhotosTab.tsx (galería de
 * hasta 10 fotos del trabajador), aquí solo hay UNA imagen: la
 * identidad visual del empleador. Reutiliza exactamente la misma
 * infraestructura (createPhotoUploadUrl/saveProfilePhoto/
 * deleteProfilePhoto sobre profile_photos, sin tabla ni migración
 * nueva) — la "singularidad" es una decisión de UI, no de esquema: al
 * subir un reemplazo, se guarda primero la nueva foto como principal y
 * luego se borra la anterior, para que un empleador nunca acumule más
 * de una fila en profile_photos aunque la tabla lo permitiría.
 */
export function EmployerLogoUpload({ profile, initialPhoto, onPhotoChange }: EmployerLogoUploadProps) {
  const [photo, setPhoto] = useState<ProfilePhoto | null>(initialPhoto);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast("Solo se permiten imágenes JPG, PNG o WebP", "error");
      return;
    }

    const previous = photo;
    setUploading(true);
    setUploadProgress(0);

    try {
      const compressed = await compressImage(file);

      const urlRes = await createPhotoUploadUrl(file.name);
      if ("error" in urlRes) {
        toast(urlRes.error, "error");
        return;
      }

      await uploadWithProgress(urlRes.uploadUrl!, compressed, "image/jpeg", setUploadProgress);

      const saveRes = await saveProfilePhoto({
        storagePath: urlRes.storagePath!,
        publicUrl: urlRes.publicUrl!,
        isPrimary: true,
      });

      if ("error" in saveRes) {
        toast(saveRes.error, "error");
        return;
      }

      setPhoto(saveRes.photo!);
      onPhotoChange(saveRes.photo!);
      toast(previous ? "Foto actualizada" : "Foto subida correctamente", "success");

      // Mantener una sola foto para el empleador — se borra la anterior
      // recién después de confirmar que la nueva ya quedó guardada.
      if (previous) await deleteProfilePhoto(previous.id);
    } catch {
      toast("Error al subir la imagen. Inténtalo de nuevo.", "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleDelete() {
    if (!photo) return;
    startTransition(async () => {
      const res = await deleteProfilePhoto(photo.id);
      if ("error" in res) {
        toast(res.error, "error");
      } else {
        setPhoto(null);
        onPhotoChange(null);
        setConfirmDelete(false);
        toast("Foto eliminada", "success");
      }
    });
  }

  const busy = uploading || isPending;

  return (
    <div className="card p-5 sm:p-6">
      <h3 className="mb-1 text-sm font-bold text-ink">Foto / logo</h3>
      <p className="mb-5 text-xs text-ink-muted">
        Un perfil con foto genera más confianza entre los trabajadores. Puede ser tu foto
        personal o el logo de tu negocio.
      </p>

      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="relative shrink-0">
          <Avatar name={profile.full_name} src={photo?.public_url ?? profile.avatar_url} size="xl" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label={photo ? "Cambiar foto" : "Subir foto"}
            className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-white shadow-card transition-colors hover:bg-primary-600 disabled:opacity-60"
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>

        <div className="flex w-full flex-1 flex-col gap-2 sm:items-start">
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="btn-primary w-full justify-center sm:w-auto"
            >
              {uploading ? `Subiendo… ${uploadProgress}%` : photo ? "Cambiar foto" : "Subir foto"}
            </button>

            {photo &&
              (confirmDelete ? (
                <div className="flex w-full gap-2 sm:w-auto">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-danger-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-danger-600 disabled:opacity-60 sm:flex-none"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-ink-muted sm:flex-none"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="btn-secondary w-full justify-center gap-1.5 text-danger-600 sm:w-auto"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </button>
              ))}
          </div>

          {uploading && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-primary-100">
              <div
                className="h-full rounded-full bg-brand-gradient transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
