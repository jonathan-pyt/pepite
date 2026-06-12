import { useEffect, useState } from "react"
import { browser } from "wxt/browser"

import { HOST_PERMISSIONS, LISTING_MATCHES } from "@/lib/host-permissions"

/** APIs publiques + sites d'annonces : tout ce que Firefox doit accorder. */
const ALL_ORIGINS = [...HOST_PERMISSIONS, ...LISTING_MATCHES]

export interface UseHostPermissions {
  /** true tant que la vérification n'a pas conclu — le bandeau ne flashe jamais. */
  granted: boolean
  /** À appeler depuis un geste utilisateur (clic) : permissions.request l'exige. */
  requestPermissions: () => Promise<void>
}

/**
 * useHostPermissions — accès aux origines réseau du manifest.
 *
 * Sur Firefox MV3, les host_permissions sont optionnelles (non accordées à
 * l'installation) : sans elles, géocodage/DVF/enrichissements échouent en
 * silence. Le side panel affiche donc un bandeau « Autoriser » tant que
 * permissions.contains est faux. Sur Chrome, elles sont accordées d'office →
 * contains renvoie true et le bandeau n'apparaît jamais.
 */
export function useHostPermissions(): UseHostPermissions {
  const [granted, setGranted] = useState(true)

  useEffect(() => {
    // API permissions absente (vieux navigateur) → on ne peut rien vérifier,
    // on n'affiche pas le bandeau.
    if (!browser.permissions?.contains) return
    void browser.permissions
      .contains({ origins: ALL_ORIGINS })
      .then(setGranted)
      .catch(() => {})
  }, [])

  async function requestPermissions() {
    try {
      const ok = await browser.permissions.request({ origins: ALL_ORIGINS })
      if (ok) setGranted(true)
    } catch {
      // refus ou appel hors geste utilisateur → le bandeau reste affiché
    }
  }

  return { granted, requestPermissions }
}
