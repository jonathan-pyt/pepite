import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Pépite: 13px / border-line / rounded-[9px] (zone prompt maquette screen7)
        "min-h-[54px] w-full min-w-0 rounded-[9px] border border-line bg-white px-[13px] py-2.5 text-[13px] leading-[1.55] text-ink shadow-pepite-control transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-ink-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
