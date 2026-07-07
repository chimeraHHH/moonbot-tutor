import type { ReactNode } from 'react';
import { WorkspaceShell } from '@/components/workspace/workspace-shell';
import { getCurrentUserFast } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserFast();
  return <WorkspaceShell currentUserRole={user?.role}>{children}</WorkspaceShell>;
}
