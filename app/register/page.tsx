'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email, password }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Registration failed');
      }

      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/') ? next : '/student');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-6xl grid-cols-1 lg:grid-cols-[1fr_420px]">
        <section className="hidden flex-col justify-between border-r border-border/50 px-10 py-10 lg:flex">
          <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <div className="flex size-9 items-center justify-center rounded-lg bg-foreground text-background">
              S
            </div>
            SophosEdu
          </div>
          <div className="max-w-xl pb-12">
            <p className="text-sm font-medium text-muted-foreground">AI interactive classroom</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-normal">
              Create your learning workspace account.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
              Student accounts can start from the classroom workspace immediately.
            </p>
          </div>
        </section>

        <section className="flex min-h-[100dvh] items-center justify-center px-6">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex size-9 items-center justify-center rounded-lg bg-foreground text-background">
                S
              </div>
              <span className="font-medium">SophosEdu</span>
            </div>
            <div className="mb-8">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-border">
                <UserPlus className="size-5" />
              </div>
              <h2 className="text-2xl font-semibold tracking-normal">Create account</h2>
              <p className="mt-2 text-sm text-muted-foreground">Start with a student account.</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="displayName">Name</Label>
                <Input
                  id="displayName"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                <UserPlus className="size-4" />
                {submitting ? 'Creating account' : 'Create account'}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href="/login"
              >
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center bg-background text-sm text-muted-foreground">
          Loading
        </main>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
