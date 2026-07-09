import { useEffect, useState } from "react"
import { browser } from "wxt/browser"

import { llmOriginPattern } from "@/lib/host-permissions"
import { ensureLlmPermission } from "@/lib/llm-permission"
import { toLlmConfig, type Settings } from "@/lib/settings"

/** null : aucun appel LLM configuré (pas de clé ni d'endpoint). "invalid" : endpoint non parsable ou non http(s). */
export type LlmPermissionStatus = "granted" | "missing" | "invalid" | null

export interface UseLlmPermission {
  status: LlmPermissionStatus
  /** À appeler depuis un geste utilisateur (clic Enregistrer) : permissions.request l'exige. */
  request: () => Promise<void>
}

/**
 * useLlmPermission — accès réseau au fournisseur d'IA configuré.
 *
 * Toutes les origines IA sont en optional_host_permissions : on ne demande
 * que celle du fournisseur sélectionné (ou de l'endpoint OpenAI-compatible),
 * et rien du tout tant qu'aucun appel LLM n'est possible (onboarding profil
 * sans clé). Un endpoint hors de la liste du manifest rend request()
 * impossible → status "missing", signalé dans les réglages.
 */
export function useLlmPermission(settings: Settings | null): UseLlmPermission {
  const [status, setStatus] = useState<LlmPermissionStatus>(null)

  const cfg = settings ? toLlmConfig(settings) : null

  useEffect(() => {
    if (!cfg) {
      // Endpoint renseigné mais invalide : toLlmConfig peut quand même
      // retourner une config (clé présente) — le cas null est « rien à faire ».
      setStatus(null)
      return
    }
    const pattern = llmOriginPattern(cfg)
    if (!pattern) {
      setStatus("invalid")
      return
    }
    // API permissions absente (vieux navigateur) → on ne bloque pas l'UX.
    if (!browser.permissions?.contains) {
      setStatus("granted")
      return
    }
    void browser.permissions
      .contains({ origins: [pattern] })
      .then((ok) => setStatus(ok ? "granted" : "missing"))
      .catch(() => setStatus("missing"))
    // cfg est recalculé à chaque rendu : on ne dépend que de ses champs utiles.
  }, [settings?.provider, settings?.apiKey, settings?.baseURL])

  async function request() {
    if (!cfg) return
    const ok = await ensureLlmPermission(cfg)
    setStatus(ok ? "granted" : llmOriginPattern(cfg) ? "missing" : "invalid")
  }

  return { status, request }
}
