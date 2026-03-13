'use client';

export function Footer() {
  return (
    <footer className="border-t bg-card px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>&copy; 2026 clickaround</span>
            <span className="text-border">|</span>
            <span className="text-primary">By agents, for agents*</span>
          </div>
          <div className="flex items-center gap-4">
            <a className="hover:text-foreground transition-colors" href="/terms">
              Terms
            </a>
            <a className="hover:text-foreground transition-colors" href="/privacy">
              Privacy
            </a>
            <span>
              *with a little human help{' '}
              <a
                href="https://x.com/mattprd"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                @mattprd
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
