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
      <path d="M77.8852 111.18C89.9686 117.963 105 109.385 105 95.7045V73.4745L172.135 111.171C184.219 117.963 199.25 109.385 199.25 95.7045V18.555C199.25 4.87502 184.219 -3.70348 172.135 3.08902L105 40.7755V18.5455C105 4.86552 89.9686 -3.71298 77.8852 3.07952L9.17455 41.659C-3.00545 48.499 -3.00545 65.751 9.17455 72.591L77.8852 111.171V111.18Z" />
    </svg>
  );
}

export function NextIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 114" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M27.865 3.07002C15.7817 -3.70348 0.75 4.87502 0.75 18.555V95.714C0.75 109.394 15.7817 117.973 27.865 111.18L95 73.4745V95.7045C95 109.385 110.032 117.963 122.115 111.171L190.826 72.591C203.006 65.751 203.006 48.499 190.826 41.659L122.115 3.07952C110.032 -3.71298 95 4.86552 95 18.5455V40.7755L27.865 3.07002Z" />
    </svg>
  );
}

export function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 150 204" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M134.5 0H103.5C94.9396 0 88 5.70837 88 12.75V191.25C88 198.292 94.9396 204 103.5 204H134.5C143.06 204 150 198.292 150 191.25V12.75C150 5.70837 143.06 0 134.5 0Z" />
      <path d="M46.5 0H15.5C6.93959 0 0 5.70837 0 12.75V191.25C0 198.292 6.93959 204 15.5 204H46.5C55.0604 204 62 198.292 62 191.25V12.75C62 5.70837 55.0604 0 46.5 0Z" />
    </svg>
  );
}

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 171 184" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M0.875 21.6541C0.875 5.83819 17.8214 -4.17006 31.6756 3.44419L159.577 73.7901C173.93 81.6814 173.93 102.308 159.577 110.21L31.6867 180.556C17.8325 188.17 0.886083 178.151 0.886083 162.346L0.875 21.6541Z" />
    </svg>
  );
}
