'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GraduationCap, Presentation, Users } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface RoleItem {
  href: string;
  labelKey: string;
  icon: typeof GraduationCap;
}

const ROLES: RoleItem[] = [
  { href: '/student', labelKey: 'workspace.sidebar.student', icon: GraduationCap },
  { href: '/teacher', labelKey: 'workspace.sidebar.teacher', icon: Presentation },
  { href: '/parent', labelKey: 'workspace.sidebar.parent', icon: Users },
];

export function RoleSidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav
      aria-label="Workspace roles"
      className="shrink-0 w-14 min-h-[100dvh] flex flex-col items-center gap-2 py-4 border-r border-border/40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm"
    >
      <Link
        href="/student"
        aria-label="OpenMAIC"
        className="mb-2 flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 text-white text-xs font-bold shadow-sm"
      >
        M
      </Link>
      {ROLES.map(({ href, labelKey, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Tooltip key={href}>
            <TooltipTrigger asChild>
              <Link
                href={href}
                aria-label={t(labelKey)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex size-10 items-center justify-center rounded-xl transition-all',
                  active
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 shadow-sm'
                    : 'text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <Icon className="size-[18px]" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{t(labelKey)}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
