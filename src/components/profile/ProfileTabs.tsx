"use client";

import { useState, useCallback } from "react";
import { User, Image, FileText, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTab } from "@/components/profile/InfoTab";
import { PhotosTab } from "@/components/profile/PhotosTab";
import { DocumentsTab } from "@/components/profile/DocumentsTab";
import { VerificationTab } from "@/components/profile/VerificationTab";
import type {
  Profile,
  ProfilePhoto,
  VerificationDocument,
  ProfileStats,
} from "@/lib/types";

type TabId = "info" | "photos" | "documents" | "verification";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "info", label: "Información", icon: User },
  { id: "photos", label: "Fotos", icon: Image },
  { id: "documents", label: "Documentos", icon: FileText },
  { id: "verification", label: "Verificación", icon: ShieldCheck },
];

interface ProfileTabsProps {
  profile: Profile;
  photos: ProfilePhoto[];
  documents: VerificationDocument[];
  stats: ProfileStats | null;
  defaultTab?: TabId;
}

export function ProfileTabs({
  profile,
  photos,
  documents,
  stats: initialStats,
  defaultTab = "info",
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  const [currentStats, setCurrentStats] = useState(initialStats);

  // Called by child tabs after mutations that affect stats
  const handleStatsChange = useCallback(() => {
    // Trigger a soft refresh to re-read stats from server via revalidation
    // Children call computeAndSaveProfileStats() which revalidates the path,
    // but since we're client-side we pass the new stats optimistically via this callback
    // In practice, a full page refresh or router.refresh() would show latest stats.
    // For now, this is a no-op trigger that lets children signal readiness.
  }, []);

  return (
    <div>
      {/* Tab navigation */}
      <div className="mb-6">
        <nav
          className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1"
          aria-label="Secciones del perfil"
          role="tablist"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150",
                  activeTab === tab.id
                    ? "bg-white text-primary-600 shadow-card"
                    : "text-ink-muted hover:text-ink"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "info" && (
        <InfoTab profile={profile} onStatsChange={handleStatsChange} />
      )}
      {activeTab === "photos" && (
        <PhotosTab initialPhotos={photos} onStatsChange={handleStatsChange} />
      )}
      {activeTab === "documents" && (
        <DocumentsTab initialDocuments={documents} onStatsChange={handleStatsChange} />
      )}
      {activeTab === "verification" && (
        <VerificationTab
          profile={profile}
          stats={currentStats}
          photos={photos}
          documents={documents}
        />
      )}
    </div>
  );
}
