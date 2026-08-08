"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toggleUserActive, changeUserRole } from "@/lib/actions/admin";
import { formatDate, cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toaster";
import type { Profile } from "@/lib/types";

export function AdminUserRow({ profile }: { profile: Profile }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function handleToggleActive() {
    startTransition(async () => {
      await toggleUserActive(profile.id, !profile.is_active);
      toast(profile.is_active ? "Cuenta suspendida" : "Cuenta reactivada", "info");
      router.refresh();
    });
  }

  function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const role = e.target.value as "worker" | "employer" | "admin";
    startTransition(async () => {
      await changeUserRole(profile.id, role);
      toast("Rol actualizado", "info");
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3.5 pr-4">
        <div className="flex items-center gap-3">
          <Avatar name={profile.full_name} src={profile.avatar_url} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{profile.full_name}</p>
            <p className="truncate text-xs text-ink-muted">{profile.city ?? "Sin ciudad"}</p>
          </div>
        </div>
      </td>
      <td className="py-3.5 pr-4">
        <select
          disabled={isPending}
          defaultValue={profile.role}
          onChange={handleRoleChange}
          aria-label={`Rol de ${profile.full_name}`}
          className="cursor-pointer rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium shadow-soft transition-colors hover:border-slate-300 focus:border-primary-500"
        >
          <option value="worker">Trabajador</option>
          <option value="employer">Empleador</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="py-3.5 pr-4 text-xs text-ink-muted">{formatDate(profile.created_at)}</td>
      <td className="py-3.5 pr-4">
        <button
          disabled={isPending}
          onClick={handleToggleActive}
          className={cn(
            "badge cursor-pointer transition-all duration-200 active:scale-95",
            profile.is_active
              ? "bg-success-50 text-success-700 hover:bg-success-100"
              : "bg-danger-50 text-danger-700 hover:bg-danger-100"
          )}
        >
          {profile.is_active ? "Activo" : "Suspendido"}
        </button>
      </td>
      <td className="py-3.5 text-right">
        <Link
          href={`/admin/users/${profile.id}`}
          className="btn-secondary !rounded-xl !px-3 !py-2 text-xs"
        >
          Ver perfil
        </Link>
      </td>
    </tr>
  );
}
