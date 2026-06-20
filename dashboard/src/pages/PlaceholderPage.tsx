export function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center">
      <div className="text-3xl font-bold">{title}</div>
      <div className="mt-2 text-lg text-muted-foreground">{subtitle}</div>
    </div>
  );
}
