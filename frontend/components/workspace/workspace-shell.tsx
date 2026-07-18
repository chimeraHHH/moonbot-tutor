import type { ReactNode } from 'react';
import type { UserRole } from '@/lib/server/auth-types';
import { RoleSidebar } from './role-sidebar';

export function WorkspaceShell({
  children,
  currentUserRole,
}: {
  children: ReactNode;
  currentUserRole?: UserRole;
}) {
  return (
    <div className="flex min-h-[100dvh] w-full">
      <RoleSidebar currentUserRole={currentUserRole} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
