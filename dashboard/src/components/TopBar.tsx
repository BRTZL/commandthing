import { goToTab, type Route } from "../router";
import { TABS } from "../tabs";

export function TopBar({ route }: { route: Route; floating?: boolean }) {
  return (
    <header className="z-20 flex h-14 flex-none items-center justify-between absolute top-0 left-0 right-0 backdrop-blur-sm">
      <nav className="flex flex-1 items-center px-4 gap-4">
        {TABS.map((t) => (
          <div
            key={t.id}
            data-active={route.tab === t.id ? "true" : undefined}
            onClick={() => goToTab(t.id)}
            // className="group justify-center flex-1 cursor-pointer border border-transparent pl-3 pr-4 text-muted-foreground hover:bg-transparent data-[active=true]:border-border data-[active=true]:bg-secondary data-[active=true]:text-foreground"
            className="flex-1 justify-center items-center flex border-t-4 border-transparent data-[active=true]:border-primary cursor-pointer py-2 transition-colors duration-200"
          >
            <span className="text-lg font-semibold">{t.label}</span>
          </div>
        ))}
      </nav>
    </header>
  );
}
