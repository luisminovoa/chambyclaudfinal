"use client";

import { useRef, useState, useCallback } from "react";
import { Send, Paperclip, MapPin, X, ImageIcon } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { createUploadUrl } from "@/lib/actions/chat";
import type { MessageType } from "@/lib/types";

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

interface MessageInputProps {
  conversationId: string;
  disabled?: boolean;
  onSend: (
    body: string,
    type: MessageType,
    extra?: { url?: string; metadata?: Record<string, number | string | boolean | null> }
  ) => void;
  onTyping: () => void;
}

interface ImagePreview {
  file: File;
  dataUrl: string;
}

export function MessageInput({ conversationId, disabled, onSend, onTyping }: MessageInputProps) {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    adjustHeight();
    onTyping();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  }

  function handleSendText() {
    const trimmed = text.trim();
    if (!trimmed && !imagePreview) return;
    if (imagePreview) {
      handleSendImage();
      return;
    }
    onSend(trimmed, "text");
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  async function handleSendImage() {
    if (!imagePreview) return;
    setIsUploadingImage(true);
    try {
      const result = await createUploadUrl(
        conversationId,
        imagePreview.file.name,
        imagePreview.file.type
      );
      if (result.error || !result.uploadUrl || !result.publicUrl) {
        toast(result.error ?? "Error al subir la imagen", "error");
        return;
      }
      const uploadRes = await fetch(result.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": imagePreview.file.type },
        body: imagePreview.file,
      });
      if (!uploadRes.ok) {
        toast("No se pudo subir la imagen", "error");
        return;
      }
      onSend(text.trim() || "📷 Imagen", "image", { url: result.publicUrl });
      setImagePreview(null);
      setText("");
    } finally {
      setIsUploadingImage(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Solo se permiten imágenes", "error");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast(`La imagen no puede superar los ${MAX_FILE_SIZE_MB} MB`, "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview({ file, dataUrl: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleShareLocation() {
    if (!navigator.geolocation) {
      toast("Tu navegador no soporta geolocalización", "error");
      return;
    }
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsGettingLocation(false);
        onSend("📍 Ubicación", "location", {
          metadata: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
      },
      () => {
        setIsGettingLocation(false);
        toast("No se pudo obtener tu ubicación", "error");
      },
      { timeout: 10000 }
    );
  }

  const canSend = (text.trim().length > 0 || imagePreview !== null) && !disabled && !isUploadingImage;

  return (
    <div className="border-t border-slate-100 bg-white px-3 py-2 safe-bottom">
      {/* Image preview strip */}
      {imagePreview && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-slate-50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreview.dataUrl}
            alt="Vista previa"
            className="h-14 w-14 rounded-xl object-cover"
          />
          <div className="flex-1">
            <p className="text-xs font-medium text-ink">{imagePreview.file.name}</p>
            <p className="text-xs text-ink-muted">
              {(imagePreview.file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button
            onClick={() => setImagePreview(null)}
            className="rounded-full p-1.5 text-ink-muted hover:bg-slate-200"
            aria-label="Quitar imagen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Attach image */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileSelect}
          aria-hidden
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploadingImage}
          className="shrink-0 rounded-full p-2.5 text-ink-muted transition-colors hover:bg-slate-100 hover:text-primary-600 disabled:opacity-40"
          aria-label="Adjuntar imagen"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        {/* Share location */}
        <button
          onClick={handleShareLocation}
          disabled={disabled || isGettingLocation}
          className="shrink-0 rounded-full p-2.5 text-ink-muted transition-colors hover:bg-slate-100 hover:text-primary-600 disabled:opacity-40"
          aria-label="Compartir ubicación"
        >
          <MapPin className={["h-5 w-5", isGettingLocation ? "animate-pulse text-primary-500" : ""].join(" ")} />
        </button>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje…"
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-ink placeholder:text-slate-400 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
          style={{ maxHeight: "120px" }}
          aria-label="Escribe un mensaje"
          aria-multiline
        />

        {/* Send button */}
        <button
          onClick={handleSendText}
          disabled={!canSend}
          className="shrink-0 rounded-full bg-primary-600 p-2.5 text-white shadow-glow-sm transition-all hover:bg-primary-700 hover:shadow-glow disabled:opacity-40"
          aria-label="Enviar mensaje"
        >
          {isUploadingImage ? (
            <ImageIcon className="h-5 w-5 animate-pulse" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
