import { useState } from "react"

import { sendRequest, type TabState } from "@/lib/messages"

export interface UseCorrectLocation {
  open: boolean
  /** Ouvre/ferme le popover ; à l'ouverture, préremplit la saisie avec l'adresse courante. */
  setOpen: (open: boolean) => void
  address: string
  setAddress: (address: string) => void
  submitting: boolean
  error: string | null
  /** Géocode la saisie et relance l'analyse rapide (CORRECT_LOCATION côté background). */
  submit: () => Promise<void>
}

/**
 * useCorrectLocation — popover « Corriger la localisation » du side panel.
 *
 * Certaines annonces affichent volontairement une fausse ville : l'utilisateur
 * saisit l'adresse réelle, le background géocode, écrase la localisation de
 * l'annonce et relance le pipeline quick. Le nouvel état arrive au panel via
 * TAB_STATE_CHANGED ; ici on ne gère que la saisie et l'erreur de géocodage.
 */
export function useCorrectLocation(tabId: number | null, currentAddress: string): UseCorrectLocation {
  const [open, setOpenState] = useState(false)
  const [address, setAddress] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setOpen(next: boolean) {
    setOpenState(next)
    if (next) {
      setAddress(currentAddress)
      setError(null)
    }
  }

  async function submit() {
    if (tabId === null || submitting || !address.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await sendRequest<{ state?: TabState; error?: string }>({
        type: "CORRECT_LOCATION",
        tabId,
        address: address.trim(),
      })
      if (res.error) {
        setError(res.error)
      } else if (res.state?.status === "error" && res.state.error) {
        // Géocodage OK mais pipeline quick en échec (DVF indisponible…).
        setError(res.state.error)
      } else {
        setOpenState(false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return { open, setOpen, address, setAddress, submitting, error, submit }
}
