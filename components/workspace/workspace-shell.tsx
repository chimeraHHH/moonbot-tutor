import type { ReactNode } from 'react';
import { RoleSidebar } from './role-sidebar';

export function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] w-full">
      <RoleSidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
