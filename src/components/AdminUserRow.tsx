"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleUserActive, changeUserRole } from "@/lib/actions/admin";
import { initials, formatDate } from "@/lib/utils";
import type { Profile } from "@/lib/types";

export function AdminUserRow({ profile }: { profile: Profile }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggleActive() {
    startTransition(async () => {
      await toggleUserActive(profile.id, !profile.is_active);
      router.refresh();
    });
  }

  function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const role = e.target.value as "worker" | "employer" | "admin";
    startTransition(async () => {
      await changeUserRole(profile.id, role);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
            {initials(profile.full_name)}
          </span>
          <div>
            <p className="text-sm font-medium text-slate-900">{profile.full_name}</p>
            <p className="text-xs text-slate-500">{profile.city ?? "Sin ciudad"}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4">
        <select
          disabled={isPending}
          defaultValue={profile.role}
          onChange={handleRoleChange}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
        >
          <option value="worker">Trabajador</option>
          <option value="employer">Empleador</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="py-3 pr-4 text-xs text-slate-500">{formatDate(profile.created_at)}</td>
      <td className="py-3 text-right">
        <button
          disabled={isPending}
          onClick={handleToggleActive}
          className={`badge cursor-pointer ${
            profile.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
        >
          {profile.is_active ? "Activo" : "Suspendido"}
        </button>
      </td>
    </tr>
  );
}
