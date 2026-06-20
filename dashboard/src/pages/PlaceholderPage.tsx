export function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center">
      <div className="text-[30px] font-bold">{title}</div>
      <div className="text-[17px] text-muted mt-2">{subtitle}</div>
    </div>
  );
}
