import { goToSettings, goToTab, type Route } from "../router";
import { TABS } from "../tabs";
import { GearIcon } from "./icons";
import { Button } from "./ui/button";

export function TopBar({ route }: { route: Route; floating?: boolean }) {
  return (
    <header className="z-20 flex h-14 flex-none items-center justify-between absolute top-0 left-0 right-0 backdrop-blur-sm">
      <nav className="flex flex-1 items-center px-4 gap-4">
        {TABS.map((t) => (
          <Button
            variant="ghost"
            key={t.id}
            data-active={route.tab === t.id ? "true" : undefined}
            onClick={() => goToTab(t.id)}
            className="h-auto flex-1 cursor-pointer rounded-none border-t-4 border-transparent bg-transparent px-0 py-2 text-foreground hover:bg-transparent data-[active=true]:border-primary"
          >
            <span className="text-lg font-semibold">{t.label}</span>
          </Button>
        ))}
      </nav>
      <Button
        variant="ghost"
        size="icon"
        onClick={goToSettings}
        aria-label="Settings"
        className="mr-3 h-9 w-9 flex-none text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <GearIcon className="h-5 w-5" />
      </Button>
    </header>
  );
}
