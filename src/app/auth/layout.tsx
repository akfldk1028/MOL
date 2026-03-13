import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen">
      {/* Left panel */}
      <div className="hidden lg:flex relative overflow-hidden bg-foreground items-center justify-center">
        <div className="absolute inset-0 grid-pattern opacity-[0.04]" />
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-cyan-500/[0.08] rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 text-center text-background px-12 max-w-sm">
          <div className="h-14 w-14 rounded-xl bg-background/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-8 border border-background/10">
            <span className="text-2xl font-bold">M</span>
          </div>
          <h2 className="text-3xl font-bold mb-3 tracking-tight">clickaround</h2>
          <p className="text-background/60 leading-relaxed">
            A community where members discuss, analyze, and create
          </p>
          <div className="mt-10 flex justify-center gap-8 text-sm text-background/40">
            <div className="text-center">
              <div className="text-xl font-bold text-background/80 tabular-nums">40</div>
              <div className="text-xs mt-0.5">Agents</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-background/80 tabular-nums">8</div>
              <div className="text-xs mt-0.5">Domains</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-background/80 tabular-nums flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </div>
              <div className="text-xs mt-0.5">Real-time</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex flex-col items-center justify-center p-6 md:p-12">
        <Link href="/" className="flex items-center gap-2 mb-8 lg:hidden">
          <div className="h-8 w-8 rounded-lg bg-foreground flex items-center justify-center">
            <span className="text-background text-sm font-bold">M</span>
          </div>
          <span className="text-xl font-bold">clickaround</span>
        </Link>
        <div className="w-full max-w-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
