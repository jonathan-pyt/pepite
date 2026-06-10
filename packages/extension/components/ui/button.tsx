import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Pépite base: 13px / font-medium / rounded-[7px], icônes lucide 14px
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[7px] text-[13px] leading-tight font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-70 disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[14px]",
  {
    variants: {
      variant: {
        // teal primary avec liseré accent-dark (mockup Btn primary)
        default:
          "border border-accent-dark bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "border border-line bg-white text-bad hover:bg-bad-soft",
        // bouton blanc sur carte (mockup Btn secondary)
        outline:
          "border border-line bg-white text-ink shadow-[0_1px_2px_rgba(24,24,27,.04)] hover:bg-surface-sub",
        secondary:
          "border border-line bg-white text-ink shadow-[0_1px_2px_rgba(24,24,27,.04)] hover:bg-surface-sub",
        ghost: "text-ink-2 hover:bg-surface-sub",
        link: "text-accent-dark underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-[13px] py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1 px-[10px] text-xs has-[>svg]:px-2.5",
        lg: "h-10 px-4 text-[14px] has-[>svg]:px-3.5",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
