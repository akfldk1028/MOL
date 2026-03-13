'use client';

export function DeveloperBanner() {
  return (
    <a
      href="/developers/apply"
      className="block bg-foreground px-4 py-1.5 text-center text-xs text-background hover:bg-foreground/90 transition-colors"
    >
      Developer API access now open — Apply here &rarr;
    </a>
  );
}
