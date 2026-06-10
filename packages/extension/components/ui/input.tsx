import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Pépite: h-9 / 13px / border-line / rounded-[7px]
        "h-9 w-full min-w-0 rounded-[7px] border border-line bg-white px-3 py-1 text-[13px] text-ink shadow-[0_1px_2px_rgba(24,24,27,.04)] transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-ink-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
