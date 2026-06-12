import { TooltipContent } from "@/components/ui/tooltip"

export interface MapTooltipContentProps {
  lat: number
  lon: number
  title: string
  subtitle?: string
}

/**
 * MapTooltipContent — contenu de tooltip avec mini-carte Google Maps.
 * En-tête (titre + sous-titre éventuel) puis iframe embed centrée sur le point.
 * Radix ne monte le contenu du tooltip qu'à l'ouverture (pas de forceMount) :
 * aucune requête vers Google avant le survol.
 */
export function MapTooltipContent({ lat, lon, title, subtitle }: MapTooltipContentProps) {
  return (
    <TooltipContent className="overflow-hidden rounded-lg p-0">
      <div className="px-3 py-2">
        <div className="text-xs font-semibold">{title}</div>
        {subtitle && <div className="mt-0.5 text-[11px] text-background/75">{subtitle}</div>}
      </div>
      <iframe
        src={`https://maps.google.com/maps?hl=fr&q=${lat},${lon}&z=16&output=embed`}
        title={`Carte de situation : ${title}`}
        loading="lazy"
        className="block h-[220px] w-[300px] border-0"
      />
    </TooltipContent>
  )
}
