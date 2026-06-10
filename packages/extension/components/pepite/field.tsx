import * as React from "react"

import { Label } from "@/components/ui/label"

export interface FieldProps {
  label: string
  /** Identifiant du contrôle, relié au Label via htmlFor. */
  htmlFor?: string
  /** Texte d'aide affiché sous le contrôle. */
  hint?: React.ReactNode
  children: React.ReactNode
}

/**
 * Field — Label + contrôle + texte d'aide optionnel, empilés verticalement.
 * Brique de formulaire de l'écran Réglages.
 */
export function Field({ label, htmlFor, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-ink-3">{hint}</p>}
    </div>
  )
}
