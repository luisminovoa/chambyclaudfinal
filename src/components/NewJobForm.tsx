"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createJob } from "@/lib/actions/jobs";
import type { ActionResult } from "@/lib/actions/auth";

const initialState: ActionResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? "Publicando..." : "Publicar trabajo"}
    </button>
  );
}

export function NewJobForm() {
  const [state, formAction] = useFormState(createJob, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>
      )}

      <div>
        <label htmlFor="title" className="label">
          Título del trabajo
        </label>
        <input id="title" name="title" required className="input" placeholder="Ej. Electricista para obra en San Isidro" />
      </div>

      <div>
        <label htmlFor="description" className="label">
          Descripción
        </label>
        <textarea
          id="description"
          name="description"
          required
          className="input min-h-[120px]"
          placeholder="Describe las tareas, requisitos y horario..."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className="label">
            Puesto / categoría
          </label>
          <input id="category" name="category" required className="input" placeholder="Electricista" />
        </div>
        <div>
          <label htmlFor="city" className="label">
            Ciudad
          </label>
          <input id="city" name="city" required className="input" placeholder="Lima" />
        </div>
      </div>

      <div>
        <label htmlFor="address" className="label">
          Dirección (opcional)
        </label>
        <input id="address" name="address" className="input" placeholder="Av. Ejemplo 123" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="pay_amount" className="label">
            Pago (S/)
          </label>
          <input id="pay_amount" name="pay_amount" type="number" min="0" step="0.01" className="input" placeholder="100" />
        </div>
        <div>
          <label htmlFor="pay_type" className="label">
            Tipo de pago
          </label>
          <select id="pay_type" name="pay_type" className="input" defaultValue="fijo">
            <option value="fijo">Monto fijo</option>
            <option value="por_hora">Por hora</option>
            <option value="por_dia">Por día</option>
          </select>
        </div>
        <div>
          <label htmlFor="positions_needed" className="label">
            Vacantes
          </label>
          <input
            id="positions_needed"
            name="positions_needed"
            type="number"
            min="1"
            defaultValue={1}
            className="input"
          />
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}
