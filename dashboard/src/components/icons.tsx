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

/* ---- transport icons (from usenocturne/nocturne-ui — rounded, custom shapes) ---- */

export function PreviousIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 114" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M77.89 111.18C89.97 117.96 105 109.39 105 95.7V73.47l67.14 37.7c12.08 6.79 27.11-1.79 27.11-15.47V18.56c0-13.68-15.03-22.26-27.12-15.47L105 40.78V18.55c0-13.68-15.03-22.26-27.11-15.47L9.17 41.66c-12.18 6.84-12.18 24.09 0 30.93l68.72 38.58v.01Z" />
    </svg>
  );
}

export function NextIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 114" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M27.87 3.07C15.78-3.7.75 4.88.75 18.56v77.15c0 13.68 15.03 22.26 27.12 15.47L95 73.47V95.7c0 13.68 15.03 22.26 27.12 15.47l68.71-38.58c12.18-6.84 12.18-24.09 0-30.93L122.12 3.08C110.03-3.71 95 4.87 95 18.55v22.23L27.87 3.07Z" />
    </svg>
  );
}

export function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 150 204" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M134.5 0h-31C94.94 0 88 5.71 88 12.75v178.5c0 7.04 6.94 12.75 15.5 12.75h31c8.56 0 15.5-5.71 15.5-12.75V12.75C150 5.71 143.06 0 134.5 0Z" />
      <path d="M46.5 0h-31C6.94 0 0 5.71 0 12.75v178.5C0 198.29 6.94 204 15.5 204h31c8.56 0 15.5-5.71 15.5-12.75V12.75C62 5.71 55.06 0 46.5 0Z" />
    </svg>
  );
}

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 171 184" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M.88 21.65C.88 5.84 17.82-4.17 31.68 3.44l127.9 70.35c14.35 7.89 14.35 28.52 0 36.42L31.69 180.56C17.83 188.17.89 178.15.89 162.35L.88 21.65Z" />
    </svg>
  );
}
