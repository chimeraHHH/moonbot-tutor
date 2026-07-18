'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { GraduationCap, LogOut, Presentation, Shield } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { UserRole } from '@/lib/server/auth-types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface RoleItem {
  href: string;
  labelKey: string;
  icon: typeof GraduationCap;
  adminOnly?: boolean;
}

const ROLES: RoleItem[] = [
  {
    href: '/student',
    labelKey: 'workspace.sidebar.student',
    icon: GraduationCap,
  },
  {
    href: '/teacher',
    labelKey: 'workspace.sidebar.teacher',
    icon: Presentation,
  },
  { href: '/admin', labelKey: 'workspace.sidebar.admin', icon: Shield, adminOnly: true },
];

export function RoleSidebar({ currentUserRole }: { currentUserRole?: UserRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const visibleRoles = ROLES.filter((item) => !item.adminOnly || currentUserRole === 'admin');

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <nav
      aria-label="Workspace roles"
      className="shrink-0 w-14 min-h-[100dvh] flex flex-col items-center gap-2 py-4 border-r border-border/40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm"
    >
      {visibleRoles.map(({ href, labelKey, icon: Icon }) => {
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
      {currentUserRole && (
        <div className="mt-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Sign out"
                onClick={logout}
                className="size-10 text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
              >
                <LogOut className="size-[18px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>
        </div>
      )}
    </nav>
  );
}
