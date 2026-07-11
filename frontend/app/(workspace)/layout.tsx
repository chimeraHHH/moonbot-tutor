import type { ReactNode } from 'react';
import { WorkspaceShell } from '@/components/workspace/workspace-shell';

export const dynamic = 'force-dynamic';

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
