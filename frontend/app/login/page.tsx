'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LockKeyhole, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || '登录失败');
      }

      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/') ? next : '/student');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
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
            星燧计划
          </div>
          <div className="max-w-xl pb-12">
            <p className="text-sm font-medium text-muted-foreground">AI 沉浸式学生课堂</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-normal">
              登录你的学习空间
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
              在一个教师的引导下，生成并探索属于你的可视化课程。
            </p>
          </div>
        </section>

        <section className="flex min-h-[100dvh] items-center justify-center px-6">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex size-9 items-center justify-center rounded-lg bg-foreground text-background">
                S
              </div>
              <span className="font-medium">星燧计划</span>
            </div>
            <div className="mb-8">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-border">
                <LockKeyhole className="size-5" />
              </div>
              <h2 className="text-2xl font-semibold tracking-normal">登录</h2>
              <p className="mt-2 text-sm text-muted-foreground">使用你的星燧学生账号。</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
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
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
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
                <LogIn className="size-4" />
                {submitting ? '正在登录' : '登录'}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              还没有账号？{' '}
              <Link
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href="/register"
              >
                立即注册
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center bg-background text-sm text-muted-foreground">
          加载中
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
