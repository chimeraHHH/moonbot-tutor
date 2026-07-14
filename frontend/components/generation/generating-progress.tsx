'use client';

import { Loader2 } from 'lucide-react';

interface GeneratingProgressProps {
  outlineReady: boolean; // Is outline generation complete?
  firstPageReady: boolean; // Is first page generated?
  statusMessage: string;
  error?: string | null;
}

// A single spinning circle — no per-stage milestones or labels. On failure we
// still surface a minimal error line so the user isn't stuck on a silent spinner.
export function GeneratingProgress({ error }: GeneratingProgressProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      {error ? (
        <p className="max-w-md text-center text-sm text-destructive">{error}</p>
      ) : (
        <Loader2 className="size-10 animate-spin text-primary" />
      )}
    </div>
  );
}
