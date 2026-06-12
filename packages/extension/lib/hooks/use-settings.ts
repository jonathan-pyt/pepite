import { useEffect, useState } from "react"
import { browser } from "wxt/browser"

import { clearCache } from "@/lib/repository-idb"
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
  /** Vide le store IDB `cache` et déclenche le retour visuel « Caches vidés ✓ ». */
  clearCaches: () => Promise<void>
  /** Vrai pendant ~2 s après un vidage des caches réussi. */
  cachesCleared: boolean
}

/**
 * useSettings — chargement, édition, persistance et retour visuel des réglages
 * de l'écran Réglages.
 */
export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saved, setSaved] = useState(false)
  const [cachesCleared, setCachesCleared] = useState(false)

  useEffect(() => {
    void getSettings().then(setSettings)
  }, [])

  async function save() {
    if (!settings) return
    await saveSettings(settings)
    setSaved(true)
    setTimeout(async () => {
      setSaved(false)
      // Fermeture auto réservée au flux « clé configurée » : pendant
      // l'onboarding (profil seul, sans clé), la page reste ouverte.
      if (!settings.apiKey) return
      const tab = await browser.tabs.getCurrent()
      if (tab?.id !== undefined) {
        await browser.tabs.remove(tab.id)
      } else {
        window.close()
      }
    }, 800)
  }

  // Pas de fermeture d'onglet ici : elle est réservée à l'enregistrement de la clé.
  async function clearCaches() {
    await clearCache()
    setCachesCleared(true)
    setTimeout(() => setCachesCleared(false), 2000)
  }

  return { settings, setSettings, save, saved, clearCaches, cachesCleared }
}
