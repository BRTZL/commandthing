export function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="placeholder">
      <div className="placeholder-title">{title}</div>
      <div className="placeholder-sub">{subtitle}</div>
    </div>
  );
}
