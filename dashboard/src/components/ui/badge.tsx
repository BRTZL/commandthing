import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/**
 * shadcn-style Badge — the small status chips/tags used across the dashboard
 * (model/branch chips, tool tags, state pills). Variant map composed with
 * `cn()`; no external deps.
 *
 * Usage: <Badge>NEW</Badge> · <Badge variant="waiting">needs you</Badge>
 */

const base = "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold";

const variants = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-border bg-secondary text-foreground",
  outline: "border-border bg-transparent text-foreground",
  working: "border-transparent bg-working text-primary-foreground",
  waiting: "border-transparent bg-waiting text-primary-foreground",
  destructive: "border-transparent bg-destructive text-destructive-foreground",
} as const;

export type BadgeVariant = keyof typeof variants;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  return <span className={cn(base, variants[variant], className)} {...props} />;
}
