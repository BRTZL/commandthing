import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/**
 * shadcn-style Card primitives — compose `Card` with the sub-parts as needed.
 * No external deps; every surface uses the shadcn `card` token.
 *
 * Usage:
 *   <Card>
 *     <CardHeader><CardTitle>Title</CardTitle></CardHeader>
 *     <CardContent>…</CardContent>
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

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1 p-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-lg font-bold", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-0", className)} {...props} />;
}
