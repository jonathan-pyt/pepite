import { useEffect, useState } from "react"

import { sendRequest, type TabState } from "@/lib/messages"

export interface UseUserNotes {
  notes: string
  /** Met à jour la saisie locale (réinitialise le feedback « Enregistré ✓ »). */
  setNotes: (value: string) => void
  /** Vrai si la saisie diffère des notes persistées. */
  dirty: boolean
  saving: boolean
  /** Vrai après un enregistrement réussi, jusqu'à la prochaine modification. */
  saved: boolean
  error: string | null
  /** Persiste les notes avec l'annonce (SAVE_USER_NOTES côté background). */
  save: () => Promise<void>
}

/**
 * useUserNotes — zone « Infos complémentaires » du side panel.
 *
 * Les notes (constats de visite, infos de l'agent…) sont persistées avec
 * l'annonce dans l'IDB et réappliquées au re-parse par le background. Elles
 * n'affectent pas le quick/marché : c'est l'analyse IA (ou ⟳) qui les consomme.
 */
export function useUserNotes(
  tabId: number | null,
  listingUrl: string | undefined,
  savedNotes: string | undefined,
): UseUserNotes {
  const [notes, setNotesState] = useState(savedNotes ?? "")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resynchronise la saisie quand l'annonce change (navigation entre annonces).
  // Volontairement PAS sur savedNotes : le broadcast qui suit notre propre
  // sauvegarde écraserait la saisie et le feedback ✓.
  useEffect(() => {
    setNotesState(savedNotes ?? "")
    setSaved(false)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingUrl])

  function setNotes(value: string) {
    setNotesState(value)
    setSaved(false)
  }

  const dirty = notes.trim() !== (savedNotes ?? "").trim()

  async function save() {
    if (tabId === null || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await sendRequest<{ state?: TabState; error?: string }>({
        type: "SAVE_USER_NOTES",
        tabId,
        notes: notes.trim(),
      })
      if (!res) {
        setError("Le service d'arrière-plan n'a pas répondu — réessaie.")
      } else if (res.error) {
        setError(res.error)
      } else {
        setSaved(true)
      }
    } finally {
      setSaving(false)
    }
  }

  return { notes, setNotes, dirty, saving, saved, error, save }
}
