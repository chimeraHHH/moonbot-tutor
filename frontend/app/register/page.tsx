'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DISPLAY_NAME_MAX_LENGTH,
  getSafeReturnPath,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@/lib/auth/validation';
import { broadcastAuthIdentityChange } from '@/lib/client-storage/auth-identity-sync';

function RegisterForm() {
  const searchParams = useSearchParams();
  const [displayName, setDisplayName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
        body: JSON.stringify({ displayName, identifier, password, confirmPassword }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || '注册失败');
      }

      broadcastAuthIdentityChange();
      window.location.replace(getSafeReturnPath(searchParams.get('next')));
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
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
            <h1 className="mt-4 text-5xl font-semibold tracking-normal">创建你的学生学习空间</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
              注册后即可生成可视化课程，并由一位教师全程引导学习。
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
                <UserPlus className="size-5" />
              </div>
              <h2 className="text-2xl font-semibold tracking-normal">注册学生账号</h2>
              <p className="mt-2 text-sm text-muted-foreground">开启你的星燧学习旅程。</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="displayName">昵称</Label>
                <Input
                  id="displayName"
                  autoComplete="name"
                  value={displayName}
                  maxLength={DISPLAY_NAME_MAX_LENGTH}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="identifier">手机号或邮箱</Label>
                <Input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  使用 {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} 个字符，并为星燧设置独立密码。
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认密码</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
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
                {submitting ? '正在注册' : '创建账号'}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              已有账号？{' '}
              <Link
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href="/login"
              >
                去登录
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
          加载中
        </main>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
