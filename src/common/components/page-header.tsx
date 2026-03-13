import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/common/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, children, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-8', className)}>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
      {subtitle && (
        <p className="mt-2 text-muted-foreground max-w-xl">{subtitle}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function PageBreadcrumb({ items, className }: PageBreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center gap-1.5 text-sm text-muted-foreground mb-4', className)}
    >
      <Link href="/" className="hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3" />
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
