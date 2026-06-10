import * as React from "react"

export interface ScoreRingProps {
  score: number
  size?: number
  stroke?: number
  sub?: string
}

/** Classe de couleur de texte Tailwind selon le score. */
export function scoreColorClass(score: number): string {
  if (score >= 65) return "text-good"
  if (score >= 45) return "text-warn"
  return "text-bad"
}

/** Couleur du stroke de l'arc selon le seuil de score (dataviz). */
function scoreStroke(score: number): string {
  if (score >= 65) return "var(--color-good)"
  if (score >= 45) return "var(--color-warn)"
  return "var(--color-bad)"
}

/**
 * ScoreRing — donut SVG affichant un score 0–100.
 * Piste ring-track ; arc coloré selon le seuil. Score centré en gras, sous-titre optionnel.
 *
 * Seul composant à conserver des styles inline : ce sont des valeurs de géométrie
 * SVG calculées (taille, rayon, dasharray, tailles de police dérivées de `size`).
 */
export function ScoreRing({ score, size = 56, stroke = 5, sub }: ScoreRingProps) {
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* SVG tourné de -90° pour démarrer l'arc à midi */}
      <svg width={size} height={size} className="block -rotate-90">
        {/* Piste */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-ring-track)"
          strokeWidth={stroke}
        />
        {/* Arc de remplissage */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={scoreStroke(score)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        />
      </svg>

      {/* Libellé centré */}
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          className="font-bold tracking-[-0.02em] text-ink tabular-nums"
          style={{ fontSize: size * 0.3 }}
        >
          {score}
        </span>
        {sub && (
          <span className="mt-0.5 text-ink-3" style={{ fontSize: size * 0.14 }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  )
}
