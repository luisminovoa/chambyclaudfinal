"use client";

import { useState, useTransition, useRef } from "react";
import { Upload, Star, Trash2, GripVertical, ImagePlus } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import {
  createPhotoUploadUrl,
  saveProfilePhoto,
  deleteProfilePhoto,
  setPrimaryPhoto,
  reorderPhotos,
} from "@/lib/actions/profile";
import { refreshProfileStats } from "@/lib/profile-stats";
import { uploadWithProgress } from "@/lib/upload-with-progress";
import { compressImage } from "@/lib/image-compress";
import type { ProfilePhoto, ProfileStats } from "@/lib/types";

interface PhotosTabProps {
  initialPhotos: ProfilePhoto[];
  onStatsChange: (stats: ProfileStats) => void;
}

export function PhotosTab({ initialPhotos, onStatsChange }: PhotosTabProps) {
  const [photos, setPhotos] = useState<ProfilePhoto[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
    if (!ALLOWED.includes(file.type)) {
      toast("Solo se permiten imágenes JPG, PNG o WebP", "error");
      return;
    }
    if (photos.length >= 10) {
      toast("Límite de 10 fotos alcanzado", "error");
      return;
    }

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

      const isPrimary = photos.length === 0;
      const saveRes = await saveProfilePhoto({
        storagePath: urlRes.storagePath!,
        publicUrl: urlRes.publicUrl!,
        isPrimary,
      });

      if ("error" in saveRes) {
        toast(saveRes.error, "error");
        return;
      }

      setPhotos((prev) => [...prev, saveRes.photo!]);
      toast(
        isPrimary ? "Foto principal subida exitosamente" : "Foto añadida",
        "success"
      );
      await refreshProfileStats(onStatsChange);
    } catch {
      toast("Error al subir la foto. Inténtalo de nuevo.", "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("photoId", id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverId(null);
    const draggedId = e.dataTransfer.getData("photoId");
    if (!draggedId || draggedId === targetId) return;

    const next = [...photos];
    const from = next.findIndex((p) => p.id === draggedId);
    const to = next.findIndex((p) => p.id === targetId);
    if (from < 0 || to < 0) return;

    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPhotos(next);
    startTransition(async () => { await reorderPhotos(next.map((p) => p.id)); });
  }

  function handleSetPrimary(photoId: string) {
    startTransition(async () => {
      const res = await setPrimaryPhoto(photoId);
      if ("error" in res) {
        toast(res.error, "error");
      } else {
        setPhotos((prev) => prev.map((p) => ({ ...p, is_primary: p.id === photoId })));
        toast("Foto principal actualizada", "success");
        await refreshProfileStats(onStatsChange);
      }
    });
  }

  function handleDelete(photoId: string) {
    startTransition(async () => {
      const res = await deleteProfilePhoto(photoId);
      if ("error" in res) {
        toast(res.error, "error");
      } else {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
        setConfirmDeleteId(null);
        toast("Foto eliminada", "success");
        await refreshProfileStats(onStatsChange);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Upload bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">
              {photos.length}/10 fotos
            </p>
            <p className="text-xs text-ink-muted">
              La primera foto se convierte en tu foto principal
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || photos.length >= 10}
            className="btn-primary shrink-0"
          >
            <Upload className="h-4 w-4" />
            {uploading ? `${uploadProgress}%` : "Subir foto"}
          </button>
        </div>

        {uploading && (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-primary-100">
            <div
              className="h-full rounded-full bg-brand-gradient transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Empty state */}
      {photos.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
            <ImagePlus className="h-7 w-7 text-primary-400" />
          </div>
          <div>
            <p className="font-bold text-ink">Sube tu primera foto de perfil</p>
            <p className="mt-1 text-sm text-ink-muted">
              Tu foto principal aparecerá en tus postulaciones y perfil público
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-secondary"
          >
            Seleccionar imagen
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                draggable
                onDragStart={(e) => handleDragStart(e, photo.id)}
                onDragOver={(e) => handleDragOver(e, photo.id)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => handleDrop(e, photo.id)}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border-2 transition-all duration-150",
                  photo.is_primary
                    ? "border-primary-400 shadow-glow-sm"
                    : "border-slate-100 hover:border-slate-200",
                  dragOverId === photo.id &&
                    "scale-[0.96] border-primary-300 opacity-75"
                )}
              >
                {/* Image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.public_url}
                  alt="Foto de perfil"
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />

                {/* Primary badge */}
                {photo.is_primary && (
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                    <Star className="h-2.5 w-2.5 fill-current" />
                    Principal
                  </span>
                )}

                {/* Drag indicator */}
                <div className="absolute right-2 top-2 cursor-grab opacity-0 transition-opacity group-hover:opacity-100">
                  <GripVertical className="h-5 w-5 text-white drop-shadow-md" />
                </div>

                {/* Actions overlay */}
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent px-2 pb-2 pt-4 opacity-0 transition-opacity group-hover:opacity-100">
                  {!photo.is_primary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(photo.id)}
                      disabled={isPending}
                      className="flex items-center gap-1 rounded-xl bg-white/20 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/30"
                    >
                      <Star className="h-3 w-3" />
                      Principal
                    </button>
                  )}
                  {confirmDeleteId === photo.id ? (
                    <div className="ml-auto flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(photo.id)}
                        disabled={isPending}
                        className="rounded-xl bg-danger-500 px-2 py-1 text-[11px] font-semibold text-white"
                      >
                        Eliminar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-xl bg-white/20 px-2 py-1 text-[11px] font-semibold text-white"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(photo.id)}
                      disabled={isPending}
                      className="ml-auto flex h-7 w-7 items-center justify-center rounded-xl bg-danger-500/80 text-white transition-colors hover:bg-danger-500"
                      aria-label="Eliminar foto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-ink-muted">
            Arrastra las fotos para cambiar el orden
          </p>
        </>
      )}
    </div>
  );
}
