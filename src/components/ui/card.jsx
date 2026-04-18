import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef(({ className, variant, ...props }, ref) => {
  const base = "rounded-lg border bg-card text-card-foreground shadow-sm"
  const variants = {
    glass: "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-white shadow-[0_24px_64px_-20px_rgba(0,0,0,0.5)]",
    elevated: "rounded-2xl border border-slate-200/60 bg-white shadow-[0_8px_32px_-8px_rgba(15,26,46,0.12)] hover:shadow-[0_16px_48px_-12px_rgba(15,26,46,0.18)] hover:-translate-y-px transition-all",
  }
  return <div ref={ref} className={cn(variants[variant] ?? base, className)} {...props} />
})
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
