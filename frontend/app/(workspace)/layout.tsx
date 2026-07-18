import type { ReactNode } from 'react';
import { WorkspaceShell } from '@/components/workspace/workspace-shell';
import { isAuthEnabled, requireCurrentUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = isAuthEnabled() ? await requireCurrentUser() : null;
  return <WorkspaceShell currentUserRole={user?.role}>{children}</WorkspaceShell>;
}
