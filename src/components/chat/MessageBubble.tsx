import { format } from "date-fns";
import { Check, CheckCheck, Clock, MapPin, ExternalLink, ImageIcon } from "lucide-react";
import Image from "next/image";
import type { Message } from "@/lib/types";

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  isOptimistic?: boolean;
}

function ReadStatus({ message, isMine }: { message: Message; isMine: boolean }) {
  if (!isMine) return null;
  if (message.id.startsWith("optimistic-")) {
    return <Clock className="h-3 w-3 text-slate-400" aria-label="Enviando" />;
  }
  if (message.read_at) {
    return <CheckCheck className="h-3.5 w-3.5 text-primary-400" aria-label="Leído" />;
  }
  return <CheckCheck className="h-3.5 w-3.5 text-slate-300" aria-label="Enviado" />;
}

function ImageContent({ url, body }: { url: string; body: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl">
      <Image
        src={url}
        alt={body || "Imagen adjunta"}
        width={240}
        height={180}
        className="max-h-48 w-auto rounded-xl object-cover"
        loading="lazy"
      />
    </a>
  );
}

function LocationContent({ metadata }: { metadata: Message["metadata"] }) {
  if (!metadata?.lat || !metadata?.lng) {
    return <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Ubicación compartida</span>;
  }
  const lat = metadata.lat as number;
  const lng = metadata.lng as number;
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-xl border border-current/20 px-3 py-2 transition-opacity hover:opacity-80"
      aria-label="Ver ubicación en Google Maps"
    >
      <MapPin className="h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-semibold">Ubicación compartida</p>
        <p className="text-xs opacity-70">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>
      </div>
      <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
    </a>
  );
}

export function MessageBubble({ message, isMine, isOptimistic }: MessageBubbleProps) {
  const time = format(new Date(message.created_at), "HH:mm");

  return (
    <div
      className={["flex", isMine ? "justify-end" : "justify-start"].join(" ")}
      aria-label={isMine ? "Mensaje enviado" : "Mensaje recibido"}
    >
      <div
        className={[
          "relative max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-soft",
          isMine
            ? "rounded-br-sm bg-primary-600 text-white"
            : "rounded-bl-sm bg-slate-100 text-ink",
          isOptimistic ? "opacity-70" : "",
        ].join(" ")}
      >
        {/* Content based on type */}
        {message.type === "image" && message.attachment_url ? (
          <div className="space-y-1">
            <ImageContent url={message.attachment_url} body={message.body} />
            {message.body && message.body !== "📷 Imagen" && (
              <p className="mt-1 text-sm">{message.body}</p>
            )}
          </div>
        ) : message.type === "location" ? (
          <LocationContent metadata={message.metadata} />
        ) : (
          <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
        )}

        {/* Timestamp + read status */}
        <div
          className={[
            "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
            isMine ? "text-white/60" : "text-ink-muted",
          ].join(" ")}
        >
          <time dateTime={message.created_at}>{time}</time>
          <ReadStatus message={message} isMine={isMine} />
        </div>
      </div>
    </div>
  );
}
