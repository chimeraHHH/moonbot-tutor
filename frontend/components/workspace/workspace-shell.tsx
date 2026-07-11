import type { ReactNode } from 'react';

export function WorkspaceShell({
  children,
}: {
  children: ReactNode;
}) {
  return <main className="min-h-[100dvh] w-full">{children}</main>;
}
