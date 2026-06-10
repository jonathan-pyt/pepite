import { useEffect, useState } from "react"

import { getSettings, saveSettings, type Settings } from "@/lib/settings"

export interface UseSettings {
  /** `null` tant que les réglages ne sont pas chargés. */
  settings: Settings | null
  /** Met à jour le state local des réglages (non persisté). */
  setSettings: (settings: Settings) => void
  /** Persiste les réglages et déclenche le retour visuel « Enregistré ✓ ». */
  save: () => Promise<void>
  /** Vrai pendant ~2 s après une sauvegarde réussie. */
  saved: boolean
}

/**
 * useSettings — chargement, édition, persistance et retour visuel des réglages
 * de l'écran Réglages.
 */
export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void getSettings().then(setSettings)
  }, [])

  async function save() {
    if (!settings) return
    await saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return { settings, setSettings, save, saved }
}
