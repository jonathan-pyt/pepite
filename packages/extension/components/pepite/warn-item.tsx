import * as React from "react"
import { Eye, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"

type WarnTone = "warn" | "bad" | "info"

export interface WarnItemProps {
  tone?: WarnTone
  title: string
  sub?: string
}

const toneClass: Record<WarnTone, string> = {
  bad: "text-bad",
  info: "text-accent-dark",
  warn: "text-warn",
}

/**
 * WarnItem — ligne de vigilance : icône lucide + titre + sous-titre optionnel.
 * tone "bad" → rouge, "info" → teal (icône Eye), "warn" → ambre (défaut, icône TriangleAlert).
 */
export function WarnItem({ tone = "warn", title, sub }: WarnItemProps) {
  const Icon = tone === "info" ? Eye : TriangleAlert

  return (
    <div className="flex items-start gap-[9px]">
      <Icon className={cn("mt-[1.5px] size-[14px] shrink-0", toneClass[tone])} />
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium leading-[1.45] text-ink">
          {title}
        </div>
        {sub && (
          <div className="mt-px text-[11.5px] leading-[1.5] text-ink-3">{sub}</div>
        )}
      </div>
    </div>
  )
}
