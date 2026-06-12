import { useEffect, useState } from "react"

import { dismissProfileCard, getProfileCardDismissed, getSettings, saveSettings } from "@/lib/settings"

/** Placeholder d'exemple partagé (side panel + réglages) : foyer, impératifs, intention. */
export const SEARCH_PROFILE_PLACEHOLDER =
  "Ex. : couple avec deux enfants et une grand-mère à mobilité réduite — ascenseur ou plain-pied indispensable, école primaire à pied, nous cherchons notre résidence principale"

export interface UseSearchProfile {
  /** Profil persisté (null tant que le chargement n'est pas terminé). */
  profile: string | null
  draft: string
  setDraft: (value: string) => void
  saving: boolean
  /** Vrai pendant ~2 s après une sauvegarde réussie. */
  saved: boolean
  /** Persiste le profil dans les réglages (Settings.searchProfile). */
  save: () => Promise<void>
  /** Carte d'onboarding masquée définitivement (« plus tard ») — true pendant le chargement pour ne jamais flasher. */
  dismissed: boolean
  dismiss: () => Promise<void>
  /** Popover d'édition (icône topbar) ; à l'ouverture, préremplit la saisie avec le profil courant. */
  editorOpen: boolean
  setEditorOpen: (open: boolean) => void
}

/**
 * useSearchProfile — profil de recherche du foyer dans le side panel :
 * carte d'onboarding « Personnalisez vos analyses » (tant que profil vide et
 * non dismissée) et popover d'édition depuis la topbar. Le profil est injecté
 * dans chaque analyse IA et dans le prompt copié.
 */
export function useSearchProfile(): UseSearchProfile {
  const [profile, setProfile] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  const [editorOpen, setEditorOpenState] = useState(false)

  useEffect(() => {
    void getSettings().then((s) => setProfile(s.searchProfile))
    void getProfileCardDismissed().then(setDismissed)
  }, [])

  function setEditorOpen(next: boolean) {
    setEditorOpenState(next)
    if (next) setDraft(profile ?? "")
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const settings = await getSettings()
      const next = draft.trim()
      await saveSettings({ ...settings, searchProfile: next })
      setProfile(next)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setEditorOpenState(false)
    } finally {
      setSaving(false)
    }
  }

  async function dismiss() {
    await dismissProfileCard()
    setDismissed(true)
  }

  return { profile, draft, setDraft, saving, saved, save, dismissed, dismiss, editorOpen, setEditorOpen }
}
