import { useEffect, useState } from "react"
import { browser } from "wxt/browser"
import type { AnalysisResult, Enrichments, GlobalScore } from "@pepite/core"

import { sendRequest, type TabState } from "@/lib/messages"
import { idbRepository } from "@/lib/repository-idb"

export interface UseTabState {
  state: TabState
  analysis: AnalysisResult | null
  enrichments: Enrichments | null
  globalScore: GlobalScore | null
  reportId: string | null
  analysisDate: string | null
  error: string | null
  /** Lance l'analyse IA complète. */
  runFullAnalysis: () => Promise<void>
}

/**
 * useTabState — état de l'onglet courant pour le side panel.
 *
 * Centralise toute la logique précédemment inline dans le composant :
 *  - GET_TAB_STATE initial + écoute TAB_STATE_CHANGED (filtrée sur l'onglet courant) ;
 *  - re-query sur tabs.onActivated (changement d'onglet) ;
 *  - storage.onChanged → efface l'erreur clé API quand les réglages changent ;
 *  - purge analyse/rapport/erreur quand l'URL de l'annonce change (anti-stale) ;
 *  - RUN_FULL_ANALYSIS avec gestion d'erreur NO_API_KEY.
 */
export function useTabState(): UseTabState {
  const [tabId, setTabId] = useState<number | null>(null)
  const [state, setState] = useState<TabState>({ status: "idle" })
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [enrichments, setEnrichments] = useState<Enrichments | null>(null)
  const [globalScore, setGlobalScore] = useState<GlobalScore | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [analysisDate, setAnalysisDate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Purge analyse/rapport/erreur quand l'annonce change (anti-stale),
  // puis tente de restaurer depuis IndexedDB.
  const listingUrl = state.listing?.url
  useEffect(() => {
    setAnalysis(null)
    setEnrichments(null)
    setGlobalScore(null)
    setReportId(null)
    setAnalysisDate(null)
    setError(null)

    if (!listingUrl) return

    let cancelled = false
    void idbRepository.getLatestReportByUrl(listingUrl).then((report) => {
      if (cancelled || !report) return
      setAnalysis(report.analysis)
      setEnrichments(report.enrichments ?? null)
      setGlobalScore(report.globalScore ?? null)
      setReportId(report.id)
      setAnalysisDate(report.createdAt)
    })

    return () => {
      cancelled = true
    }
  }, [listingUrl])

  useEffect(() => {
    let currentTabId: number | null = null

    void sendRequest<{ tabId?: number; state: TabState }>({ type: "GET_TAB_STATE" }).then((r) => {
      if (r.tabId !== undefined) {
        currentTabId = r.tabId
        setTabId(r.tabId)
      }
      setState(r.state)
    })

    const listener = (msg: { type?: string; tabId?: number; state?: TabState }) => {
      if (
        msg.type === "TAB_STATE_CHANGED" &&
        msg.state &&
        (currentTabId === null || msg.tabId === currentTabId)
      ) {
        setState(msg.state)
      }
    }
    browser.runtime.onMessage.addListener(listener)

    // Re-query tab state on tab switch
    const onActivated = () => {
      void sendRequest<{ tabId?: number; state: TabState }>({ type: "GET_TAB_STATE" }).then((r) => {
        if (r.tabId !== undefined) {
          currentTabId = r.tabId
          setTabId(r.tabId)
        }
        setState(r.state)
      })
    }
    browser.tabs.onActivated.addListener(onActivated)

    // Clear API-key error when settings are saved
    // WXT stores "local:settings" under the raw key "settings" in chrome.storage.local
    // (resolveKey strips the area prefix before calling the driver)
    const onStorageChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === "local" && "settings" in changes) setError(null)
    }
    browser.storage.onChanged.addListener(onStorageChanged)

    return () => {
      browser.runtime.onMessage.removeListener(listener)
      browser.tabs.onActivated.removeListener(onActivated)
      browser.storage.onChanged.removeListener(onStorageChanged)
    }
  }, [])

  async function runFullAnalysis() {
    if (tabId === null) return
    setError(null)
    const res = await sendRequest<{
      reportId?: string
      analysis?: AnalysisResult
      enrichments?: Enrichments
      globalScore?: GlobalScore
      error?: string
    }>({
      type: "RUN_FULL_ANALYSIS",
      tabId,
    })
    if (res.error === "NO_API_KEY") {
      setError("Clé API manquante — configure un provider dans les réglages.")
    } else if (res.error) {
      setError(res.error)
    } else {
      setAnalysis(res.analysis ?? null)
      setEnrichments(res.enrichments ?? null)
      setGlobalScore(res.globalScore ?? null)
      setReportId(res.reportId ?? null)
      setAnalysisDate(new Date().toISOString())
    }
  }

  return { state, analysis, enrichments, globalScore, reportId, analysisDate, error, runFullAnalysis }
}
