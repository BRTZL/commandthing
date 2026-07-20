export type TabId = "sessions" | "usage" | "music" | "focus";

export interface TabDef {
  id: TabId;
  label: string;
  /** Physical preset button (1-4) that selects this tab. */
  preset: number;
}

export const TABS: TabDef[] = [
  { id: "sessions", label: "Sessions", preset: 1 },
  { id: "usage", label: "Usage", preset: 2 },
  { id: "music", label: "Music", preset: 3 },
  { id: "focus", label: "Focus", preset: 4 },
];

export function tabByPreset(preset: number): TabDef | undefined {
  return TABS.find((t) => t.preset === preset);
}
