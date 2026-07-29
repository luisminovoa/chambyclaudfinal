"use client";

import { useState } from "react";

interface GalleryImage {
  id?: string;
  public_url: string;
  display_order: number;
}

export function ImageGallery({ images }: { images: GalleryImage[] }) {
  const sorted = [...images].sort((a, b) => a.display_order - b.display_order);
  const [activeIndex, setActiveIndex] = useState(0);

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="aspect-video overflow-hidden rounded-2xl bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sorted[activeIndex].public_url}
          alt="Foto del trabajo"
          className="h-full w-full object-cover"
        />
      </div>
      {sorted.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sorted.map((img, i) => (
            <button
              key={img.id ?? i}
              onClick={() => setActiveIndex(i)}
              aria-label={`Ver foto ${i + 1}`}
              className={`relative h-16 w-16 flex-none overflow-hidden rounded-xl border-2 transition-colors ${
                i === activeIndex
                  ? "border-primary-500"
                  : "border-transparent opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.public_url}
                alt={`Foto ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
