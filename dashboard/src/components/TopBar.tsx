import { goToTab, type Route } from "../router";
import { TABS } from "../tabs";
import { Button } from "./ui/button";

export function TopBar({ route }: { route: Route }) {
  return (
    <header className="flex h-20 flex-none items-center justify-between border-b border-border px-4">
      <nav className="flex flex-1 items-center">
        {TABS.map((t) => (
          <Button
            key={t.id}
            variant="ghost"
            data-active={route.tab === t.id ? "true" : undefined}
            onClick={() => goToTab(t.id)}
            className="group mr-2 h-11 w-full flex-1 cursor-pointer border border-transparent pl-3 pr-4 text-muted-foreground hover:bg-transparent data-[active=true]:border-border data-[active=true]:bg-secondary data-[active=true]:text-foreground"
          >
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted text-sm font-bold text-muted-foreground group-data-[active=true]:bg-primary group-data-[active=true]:text-primary-foreground">
              {t.preset}
            </span>
            <span className="text-lg font-semibold">{t.label}</span>
          </Button>
        ))}
      </nav>
    </header>
  );
}
