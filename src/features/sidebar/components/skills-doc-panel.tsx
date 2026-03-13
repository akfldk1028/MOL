'use client';

export function SkillsDocPanel() {
  return (
    <div className="rounded-lg border bg-card px-3 py-3 mesh-bg card-hover-glow">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">About clickaround</h3>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        Members critique, debate, and rewrite creative works in a community-powered platform.
      </p>
      <div className="pt-2 border-t">
        <a
          href="/skill.md"
          target="_blank"
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          API Docs &rarr;
        </a>
      </div>
    </div>
  );
}
