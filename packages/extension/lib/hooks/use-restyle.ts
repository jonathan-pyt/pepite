import { useEffect, useMemo, useState } from "react"
import type { Listing, RestyleCost, RestyleStyleChoice } from "@pepite/core"
import { RESTYLE_STYLES, estimateRestyleCost, restyleImage } from "@pepite/core"

import { idbRepository, saveRestyle, type RestyleRecord } from "@/lib/repository-idb"
import { getSettings, toLlmConfig, type Settings } from "@/lib/settings"

export type RestyleStatus =
  /** Chargement de l'annonce et des réglages. */
  | "loading"
  /** Pas de paramètre `url` ou annonce absente d'IndexedDB. */
  | "not-found"
  /** Pas de clé Gemini configurée (le restyle est Gemini-only). */
  | "no-key"
  /** Studio prêt. */
  | "ready"

export interface UseRestyle {
  status: RestyleStatus
  listing: Listing | null
  /** Index de la photo sélectionnée dans listing.photos. */
  photoIndex: number
  selectPhoto: (index: number) => void
  /** Nom du preset actif (ignoré si un prompt libre est saisi). */
  preset: string
  setPreset: (nom: string) => void
  /** Prompt libre — prioritaire sur le preset quand non vide. */
  custom: string
  setCustom: (value: string) => void
  /** Libellé du style qui sera utilisé à la prochaine génération. */
  styleLabel: string
  generating: boolean
  /** Object URL du rendu Gemini (null avant génération). */
  afterUrl: string | null
  /** Libellé du style du rendu affiché. */
  generatedStyleLabel: string | null
  cost: RestyleCost | null
  costPending: boolean
  error: string | null
  /** Vrai une fois le restyle persisté en IDB (→ visible dans le rapport). */
  saved: boolean
  generate: () => Promise<void>
  /** Télécharge l'image générée. */
  exportImage: () => void
}

/**
 * useRestyle — logique du studio Restyle IA (entrypoints/restyle).
 *
 * Charge l'annonce par URL depuis IndexedDB, vérifie la clé Gemini, puis :
 * fetch(photo) → restyleImage (appel Gemini fait DANS la page) → blob affiché
 * + saveRestyle + estimateRestyleCost en parallèle.
 */
export function useRestyle(): UseRestyle {
  const listingUrl = useMemo(
    () => new URLSearchParams(window.location.search).get("url"),
    [],
  )

  const [listing, setListing] = useState<Listing | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loaded, setLoaded] = useState(false)

  const [photoIndex, setPhotoIndex] = useState(0)
  const [preset, setPreset] = useState(RESTYLE_STYLES[0]!.nom)
  const [custom, setCustom] = useState("")

  const [generating, setGenerating] = useState(false)
  const [afterUrl, setAfterUrl] = useState<string | null>(null)
  const [afterImage, setAfterImage] = useState<Blob | null>(null)
  const [generatedStyleLabel, setGeneratedStyleLabel] = useState<string | null>(null)
  const [cost, setCost] = useState<RestyleCost | null>(null)
  const [costPending, setCostPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [l, s] = await Promise.all([
        listingUrl ? idbRepository.getListingByUrl(listingUrl) : Promise.resolve(undefined),
        getSettings(),
      ])
      if (cancelled) return
      setListing(l ?? null)
      setSettings(s)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [listingUrl])

  // Le restyle est Gemini-only, même si le provider d'analyse est autre.
  const geminiKey = settings?.provider === "google" ? settings.apiKey : ""

  const status: RestyleStatus = !loaded
    ? "loading"
    : !listing
      ? "not-found"
      : !geminiKey
        ? "no-key"
        : "ready"

  const styleLabel = custom.trim() ? "Style personnalisé" : preset

  function resetResult() {
    setAfterUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setAfterImage(null)
    setGeneratedStyleLabel(null)
    setCost(null)
    setCostPending(false)
    setSaved(false)
    setError(null)
  }

  function selectPhoto(index: number) {
    if (index === photoIndex) return
    setPhotoIndex(index)
    resetResult()
  }

  async function generate() {
    if (generating || !listing || !settings || !geminiKey) return
    const photoUrl = listing.photos[photoIndex]
    if (!photoUrl) return

    const style: RestyleStyleChoice = custom.trim()
      ? { custom: custom.trim() }
      : { preset }
    const label = styleLabel

    setGenerating(true)
    setError(null)
    setSaved(false)
    setCost(null)
    try {
      const res = await fetch(photoUrl)
      if (!res.ok) throw new Error(`Photo de l'annonce inaccessible (HTTP ${res.status})`)
      const data = new Uint8Array(await res.arrayBuffer())
      const mediaType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg"

      const out = await restyleImage({ apiKey: geminiKey, image: { data, mediaType }, style })

      const image = new Blob([out.data.slice().buffer], { type: out.mediaType })
      setAfterUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(image)
      })
      setAfterImage(image)
      setGeneratedStyleLabel(label)

      // Persistance + estimation travaux en parallèle.
      const record: RestyleRecord = {
        id: crypto.randomUUID(),
        listingUrl: listing.url,
        photoUrl,
        styleLabel: label,
        image,
        createdAt: new Date().toISOString(),
      }
      void saveRestyle(record).then(() => setSaved(true))

      const cfg = toLlmConfig(settings)
      if (cfg) {
        setCostPending(true)
        void estimateRestyleCost({ listing, styleLabel: label, settings: cfg })
          .then(async (c) => {
            setCost(c)
            await saveRestyle({ ...record, cost: c })
          })
          .catch((e) => {
            console.warn("[pepite] estimation travaux indisponible:", e)
          })
          .finally(() => setCostPending(false))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  function exportImage() {
    if (!afterImage || !afterUrl) return
    const ext = afterImage.type === "image/jpeg" ? "jpg" : "png"
    const a = document.createElement("a")
    a.href = afterUrl
    a.download = `pepite-restyle-${(generatedStyleLabel ?? "style").toLowerCase().replace(/\s+/g, "-")}.${ext}`
    a.click()
  }

  return {
    status,
    listing,
    photoIndex,
    selectPhoto,
    preset,
    setPreset,
    custom,
    setCustom,
    styleLabel,
    generating,
    afterUrl,
    generatedStyleLabel,
    cost,
    costPending,
    error,
    saved,
    generate,
    exportImage,
  }
}
