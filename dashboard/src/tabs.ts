export type TabId = "sessions" | "usage" | "calendar" | "more";

export interface TabDef {
  id: TabId;
  label: string;
  /** Physical preset button (1-4) that selects this tab. */
  preset: number;
  /** Placeholder tabs show a "coming soon" page. */
  placeholder?: boolean;
}

export const TABS: TabDef[] = [
  { id: "sessions", label: "Sessions", preset: 1 },
  { id: "usage", label: "Usage", preset: 2 },
  { id: "calendar", label: "Calendar", preset: 3, placeholder: true },
  { id: "more", label: "More", preset: 4, placeholder: true },
];

export function tabByPreset(preset: number): TabDef | undefined {
  return TABS.find((t) => t.preset === preset);
}
