import { useState } from "react"
import type { NegotiationEmails, Report } from "@pepite/core"

import { sendRequest } from "@/lib/messages"

export type NegotiationTone = "assertif" | "modere" | "aimable"

export const NEGOTIATION_TONES: { key: NegotiationTone; label: string }[] = [
  { key: "assertif", label: "Assertif" },
  { key: "modere", label: "Modéré" },
  { key: "aimable", label: "Aimable" },
]

export interface UseNegotiation {
  /** Les 3 variantes (restaurées du rapport ou fraîchement générées), null sinon. */
  emails: NegotiationEmails | null
  tone: NegotiationTone
  setTone: (tone: NegotiationTone) => void
  generating: boolean
  error: string | null
  /** Vrai pendant ~1,6 s après une copie réussie. */
  copied: boolean
  /** Génère (ou régénère) les 3 mails via le background, persistés sur le rapport. */
  generate: () => Promise<void>
  /** Copie objet + corps du mail du ton actif dans le presse-papiers. */
  copy: () => Promise<void>
}

/**
 * useNegotiation — logique de la section « Mails de négociation » de la page rapport.
 *
 * Restaure les mails déjà persistés sur le rapport, déclenche la génération
 * (GENERATE_NEGOTIATION_EMAILS dans le background) et gère ton actif + copie.
 */
export function useNegotiation(report: Report | null): UseNegotiation {
  const [generated, setGenerated] = useState<NegotiationEmails | null>(null)
  const [tone, setToneState] = useState<NegotiationTone>("assertif")
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Dérivé au rendu : mails fraîchement générés, sinon ceux persistés sur le rapport.
  const emails = generated ?? report?.negotiationEmails ?? null

  function setTone(next: NegotiationTone) {
    setToneState(next)
    setCopied(false)
  }

  async function generate() {
    if (!report || generating) return
    setGenerating(true)
    setError(null)
    setCopied(false)
    try {
      const res = await sendRequest<{ emails?: NegotiationEmails; error?: string }>({
        type: "GENERATE_NEGOTIATION_EMAILS",
        reportId: report.id,
      })
      if (res.error === "NO_API_KEY") {
        setError("Clé API manquante — configure un provider dans les réglages.")
      } else if (res.error) {
        setError(res.error)
      } else {
        setGenerated(res.emails ?? null)
      }
    } finally {
      setGenerating(false)
    }
  }

  async function copy() {
    if (!emails) return
    const mail = emails[tone]
    await navigator.clipboard.writeText(`Objet : ${mail.objet}\n\n${mail.corps}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return { emails, tone, setTone, generating, error, copied, generate, copy }
}
