import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/**
 * shadcn-style Card primitives — compose `Card` with the sub-parts as needed.
 * No external deps; every surface uses the shadcn `card` token.
 *
 * Usage:
 *   <Card>
 *     <Card>…</Card>
 *   </Card>
 */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-border bg-card text-card-foreground", className)}
      {...props}
    />
  );
}
