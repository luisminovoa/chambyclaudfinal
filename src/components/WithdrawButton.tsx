"use client";

import { useState, useTransition } from "react";
import { Undo2, AlertCircle } from "lucide-react";
import { withdrawApplication } from "@/lib/actions/jobs";
import { useToast } from "@/components/ui/Toaster";

interface WithdrawButtonProps {
  applicationId: string;
}

export function WithdrawButton({ applicationId }: WithdrawButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function handleWithdraw() {
    setConfirming(false);
    startTransition(async () => {
      const result = await withdrawApplication(applicationId);
      if (result.error) {
        toast(result.error, "error");
      } else {
        toast("Postulación retirada", "info");
      }
    });
  }

  if (confirming) {
    return (
      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-warning-100 bg-warning-50 p-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-warning-700">
            ¿Confirmas que quieres retirar tu postulación?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              disabled={isPending}
              onClick={handleWithdraw}
              className="btn-ghost !rounded-xl !px-3 !py-1.5 text-xs !text-danger-600 hover:!bg-danger-50"
            >
              Sí, retirar
            </button>
            <button
              disabled={isPending}
              onClick={() => setConfirming(false)}
              className="btn-ghost !rounded-xl !px-3 !py-1.5 text-xs"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      disabled={isPending}
      onClick={() => setConfirming(true)}
      className="btn-ghost !rounded-xl !px-3 !py-2 text-xs !text-ink-muted"
    >
      <Undo2 className="h-3.5 w-3.5" />
      Retirar postulación
    </button>
  );
}
