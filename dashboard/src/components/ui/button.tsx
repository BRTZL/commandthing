import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/**
 * shadcn-style Button — self-contained (no `cva`, no external deps): the variant
 * and size maps are plain records composed with `cn()`.
 *
 * The base `button` reset in index.css already strips the device's native button
 * fill and the default blue focus outline, so there's no stray ring — focus
 * styling is opt-in (add a `focus:` class via `className` when you want one).
 *
 * Usage: <Button>Go</Button> · <Button variant="outline" size="sm">…</Button>
 */

const base =
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50";

const variants = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-border bg-transparent text-foreground hover:bg-secondary",
  ghost: "bg-transparent text-foreground hover:bg-secondary",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-base",
  lg: "h-12 px-6 text-lg",
  icon: "h-10 w-10",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />
  );
}
