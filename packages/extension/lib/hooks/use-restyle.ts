import { useEffect, useMemo, useRef, useState } from "react"
import type { Listing, RestyleCost, RestyleStyleChoice } from "@pepite/core"
import { RESTYLE_STYLES, estimateRestyleCost, restyleImage, restyleStyleLabel } from "@pepite/core"

import {
  deleteRestyle,
  idbRepository,
  listRestylesByUrl,
  saveRestyle,
  type RestyleRecord,
} from "@/lib/repository-idb"
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
  /** Id du rapport le plus récent du bien (lien « ← Rapport »), sinon null. */
  reportId: string | null
  /** Index de la photo sélectionnée dans listing.photos. */
  photoIndex: number
  selectPhoto: (index: number) => void
  /** Nom du preset actif, ou null en mode 100 % texte libre. */
  preset: string | null
  /** Sélectionne le preset — re-cliquer le preset actif le désélectionne. */
  togglePreset: (nom: string) => void
  /** Précisions libres — complètent le preset, ou style custom seul. */
  custom: string
  setCustom: (value: string) => void
  /** Vrai dès qu'un preset ou un texte libre est renseigné. */
  canGenerate: boolean
  /** Libellé du style qui sera utilisé à la prochaine génération. */
  styleLabel: string
  generating: boolean
  /** Variantes générées pour cette annonce (persistées en IDB), ordre chrono. */
  variants: RestyleRecord[]
  /** Object URLs des images générées, par id de variante. */
  variantUrls: Record<string, string>
  /** Id de la variante affichée dans le BeforeAfter (null = photo seule). */
  activeVariantId: string | null
  /** Charge une variante : photo d'origine, rendu, style et coût restaurés. */
  selectVariant: (id: string) => void
  /** Supprime une variante (IDB + galerie) — récupérable en régénérant. */
  deleteVariant: (id: string) => void
  /** Object URL du rendu Gemini affiché (null avant génération). */
  afterUrl: string | null
  /** Libellé du style du rendu affiché. */
  generatedStyleLabel: string | null
  cost: RestyleCost | null
  costPending: boolean
  error: string | null
  /** Vrai une fois le restyle affiché persisté en IDB (→ visible dans le rapport). */
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
 * + saveRestyle + estimateRestyleCost en parallèle. Les restyles persistés
 * sont rechargés au démarrage et exposés en galerie de variantes.
 */
export function useRestyle(): UseRestyle {
  const listingUrl = useMemo(
    () => new URLSearchParams(window.location.search).get("url"),
    [],
  )

  const [listing, setListing] = useState<Listing | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const [photoIndex, setPhotoIndex] = useState(0)
  const [preset, setPreset] = useState<string | null>(RESTYLE_STYLES[0]!.nom)
  const [custom, setCustom] = useState("")

  const [generating, setGenerating] = useState(false)
  const [variants, setVariants] = useState<RestyleRecord[]>([])
  const [variantUrls, setVariantUrls] = useState<Record<string, string>>({})
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null)
  /** Id de la variante dont l'estimation travaux est en cours. */
  const [costPendingId, setCostPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Miroir des object URLs pour la révocation au démontage du studio.
  const urlsRef = useRef<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [l, s, report] = await Promise.all([
        listingUrl ? idbRepository.getListingByUrl(listingUrl) : Promise.resolve(undefined),
        getSettings(),
        listingUrl ? idbRepository.getLatestReportByUrl(listingUrl) : Promise.resolve(undefined),
      ])
      if (cancelled) return
      setListing(l ?? null)
      setSettings(s)
      setReportId(report?.id ?? null)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [listingUrl])

  // Galerie : variantes persistées en IDB, ordre chronologique.
  useEffect(() => {
    if (!listingUrl) return
    let cancelled = false
    void listRestylesByUrl(listingUrl).then((records) => {
      if (cancelled) return
      records.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const urls = Object.fromEntries(records.map((r) => [r.id, URL.createObjectURL(r.image)]))
      Object.assign(urlsRef.current, urls)
      setVariants(records)
      setVariantUrls((prev) => ({ ...prev, ...urls }))
    })
    return () => {
      cancelled = true
    }
  }, [listingUrl])

  useEffect(
    () => () => {
      for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url)
    },
    [],
  )

  // Le restyle est Gemini-only, même si le provider d'analyse est autre.
  const geminiKey = settings?.provider === "google" ? settings.apiKey : ""

  const status: RestyleStatus = !loaded
    ? "loading"
    : !listing
      ? "not-found"
      : !geminiKey
        ? "no-key"
        : "ready"

  const canGenerate = preset !== null || custom.trim().length > 0
  const styleLabel = canGenerate
    ? restyleStyleLabel({ preset: preset ?? undefined, custom })
    : "—"

  const active = activeVariantId
    ? (variants.find((v) => v.id === activeVariantId) ?? null)
    : null
  const afterUrl = activeVariantId ? (variantUrls[activeVariantId] ?? null) : null
  const generatedStyleLabel = active?.styleLabel ?? null
  const cost = active?.cost ?? null
  const costPending = costPendingId !== null && costPendingId === activeVariantId

  function selectPhoto(index: number) {
    if (index === photoIndex) return
    setPhotoIndex(index)
    setActiveVariantId(null)
    setSaved(false)
    setError(null)
  }

  function selectVariant(id: string) {
    const record = variants.find((v) => v.id === id)
    if (!record || !listing) return
    const index = listing.photos.indexOf(record.photoUrl)
    if (index >= 0) setPhotoIndex(index)
    setActiveVariantId(id)
    setSaved(true)
    setError(null)
  }

  function deleteVariant(id: string) {
    void deleteRestyle(id)
    const url = urlsRef.current[id]
    if (url) URL.revokeObjectURL(url)
    delete urlsRef.current[id]
    setVariantUrls((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setVariants((prev) => prev.filter((v) => v.id !== id))
    if (activeVariantId === id) {
      setActiveVariantId(null)
      setSaved(false)
    }
  }

  async function generate() {
    if (generating || !listing || !settings || !geminiKey) return
    const photoUrl = listing.photos[photoIndex]
    if (!photoUrl) return

    const style: RestyleStyleChoice = {
      preset: preset ?? undefined,
      custom: custom.trim() || undefined,
    }
    if (!style.preset && !style.custom) return
    const label = restyleStyleLabel(style)

    setGenerating(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(photoUrl)
      if (!res.ok) throw new Error(`Photo de l'annonce inaccessible (HTTP ${res.status})`)
      const data = new Uint8Array(await res.arrayBuffer())
      const mediaType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg"

      const out = await restyleImage({ apiKey: geminiKey, image: { data, mediaType }, style })

      const image = new Blob([out.data.slice().buffer], { type: out.mediaType })

      // La variante rejoint la galerie et devient le rendu affiché.
      const record: RestyleRecord = {
        id: crypto.randomUUID(),
        listingUrl: listing.url,
        photoUrl,
        styleLabel: label,
        image,
        createdAt: new Date().toISOString(),
      }
      const url = URL.createObjectURL(image)
      urlsRef.current[record.id] = url
      setVariantUrls((prev) => ({ ...prev, [record.id]: url }))
      setVariants((prev) => [...prev, record])
      setActiveVariantId(record.id)

      // Persistance + estimation travaux en parallèle.
      void saveRestyle(record).then(() => setSaved(true))

      const cfg = toLlmConfig(settings)
      if (cfg) {
        setCostPendingId(record.id)
        void estimateRestyleCost({ listing, styleLabel: label, settings: cfg })
          .then(async (c) => {
            setVariants((prev) =>
              prev.map((v) => (v.id === record.id ? { ...v, cost: c } : v)),
            )
            await saveRestyle({ ...record, cost: c })
          })
          .catch((e) => {
            console.warn("[pepite] estimation travaux indisponible:", e)
          })
          .finally(() => setCostPendingId((prev) => (prev === record.id ? null : prev)))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  function exportImage() {
    if (!active || !afterUrl) return
    const ext = active.image.type === "image/jpeg" ? "jpg" : "png"
    const a = document.createElement("a")
    a.href = afterUrl
    a.download = `pepite-restyle-${active.styleLabel.toLowerCase().replace(/\s+/g, "-")}.${ext}`
    a.click()
  }

  return {
    status,
    listing,
    reportId,
    photoIndex,
    selectPhoto,
    preset,
    togglePreset: (nom) => setPreset((prev) => (prev === nom ? null : nom)),
    custom,
    setCustom,
    canGenerate,
    styleLabel,
    generating,
    variants,
    variantUrls,
    activeVariantId,
    selectVariant,
    deleteVariant,
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
