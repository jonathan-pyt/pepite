import { useEffect, useState } from "react"
import { browser } from "wxt/browser"

import { endpointOriginPattern } from "@/lib/host-permissions"

/** null : pas d'endpoint configuré. "invalid" : URL non parsable ou non http(s). */
export type EndpointPermissionStatus = "granted" | "missing" | "invalid" | null

export interface UseEndpointPermission {
  status: EndpointPermissionStatus
  /** À appeler depuis un geste utilisateur (clic Enregistrer) : permissions.request l'exige. */
  request: (baseURL: string) => Promise<void>
}

/**
 * useEndpointPermission — accès réseau à l'endpoint OpenAI-compatible configuré.
 *
 * Les origines Ollama (cloud + localhost) sont en optional_host_permissions :
 * on les demande ici à la volée, uniquement aux utilisateurs qui configurent
 * un endpoint. Un endpoint hors de cette liste (manifest) rend request()
 * impossible → status "missing", signalé sous le champ des réglages.
 */
export function useEndpointPermission(baseURL: string): UseEndpointPermission {
  const [status, setStatus] = useState<EndpointPermissionStatus>(null)

  useEffect(() => {
    if (!baseURL.trim()) {
      setStatus(null)
      return
    }
    const pattern = endpointOriginPattern(baseURL)
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
  }, [baseURL])

  async function request(url: string) {
    const pattern = endpointOriginPattern(url)
    if (!pattern || !browser.permissions?.request) return
    try {
      const ok = await browser.permissions.request({ origins: [pattern] })
      setStatus(ok ? "granted" : "missing")
    } catch {
      // Origine absente d'optional_host_permissions ou refus → le message
      // sous le champ reste affiché.
      setStatus("missing")
    }
  }

  return { status, request }
}
