import type { SVGProps } from "react";

/**
 * Hand-rolled SVG icons (no icon-library dep — nocturne-ui does the same).
 * They inherit `currentColor`; size them with a width/height className.
 */
function Stroke({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Stroke {...props}>
      <path d="M15 18l-6-6 6-6" />
    </Stroke>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Stroke {...props}>
      <path d="M12 5v14M5 12h14" />
    </Stroke>
  );
}

export function MinusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Stroke {...props}>
      <path d="M5 12h14" />
    </Stroke>
  );
}
