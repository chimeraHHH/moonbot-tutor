'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, RefreshCw, Save, Shield, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type Role = 'student' | 'teacher' | 'parent' | 'admin';
type Status = 'active' | 'disabled';

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: Status;
  createdAt: string;
  lastLoginAt: string | null;
}

interface Overview {
  users: number;
  activeSessions: number;
  classrooms: number;
  generationJobs: number;
  failedJobs: number;
}

interface RecentClassroom {
  id: string;
  title: string;
  sceneCount: number;
  createdAt: string;
  ownerEmail: string | null;
}

interface RecentJob {
  id: string;
  status: string;
  step: string | null;
  progress: number;
  message: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  classroomId: string | null;
  ownerEmail: string | null;
}

const ROLE_OPTIONS: Role[] = [
  'student',
  // 'teacher',
  // 'parent',
  'admin',
];
const STATUS_OPTIONS: Status[] = ['active', 'disabled'];

export function AdminDashboard({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recentClassrooms, setRecentClassrooms] = useState<RecentClassroom[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    email: '',
    displayName: '',
    password: '',
    role: 'student' as Role,
  });
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [users],
  );

  async function loadAdminData() {
    setLoading(true);
    setError(null);
    try {
      const [overviewResponse, usersResponse] = await Promise.all([
        fetch('/api/admin/overview'),
        fetch('/api/admin/users'),
      ]);
      const overviewData = await overviewResponse.json();
      const usersData = await usersResponse.json();
      if (!overviewResponse.ok || !overviewData.success) {
        throw new Error(overviewData.error || 'Failed to load overview');
      }
      if (!usersResponse.ok || !usersData.success) {
        throw new Error(usersData.error || 'Failed to load users');
      }
      setOverview(overviewData.overview);
      setRecentClassrooms(overviewData.recentClassrooms || []);
      setRecentJobs(overviewData.recentJobs || []);
      setUsers(usersData.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      setError(data.error || 'Failed to create user');
      return;
    }
    setUsers((prev) => [data.user, ...prev]);
    setNewUser({ email: '', displayName: '', password: '', role: 'student' });
    setNotice('User created');
    await loadAdminData();
  }

  async function patchUser(userId: string, patch: Partial<AdminUser> & { password?: string }) {
    setSavingUserId(userId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update user');
      }
      setUsers((prev) => prev.map((user) => (user.id === userId ? data.user : user)));
      if (patch.password) {
        setPasswordDrafts((prev) => ({ ...prev, [userId]: '' }));
      }
      setNotice('User updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-background px-6 py-6 text-foreground lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Shield className="size-4" />
              Admin
            </div>
            <h1 className="text-2xl font-semibold tracking-normal">SophosEdu Admin</h1>
          </div>
          <Button variant="outline" className="gap-2" onClick={loadAdminData} disabled={loading}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </header>

        {overview && (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Users', overview.users],
              ['Active sessions', overview.activeSessions],
              ['Classrooms', overview.classrooms],
              ['Jobs', overview.generationJobs],
              ['Failed jobs', overview.failedJobs],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </section>
        )}

        <form
          className="grid gap-3 rounded-lg border border-border bg-card p-4 lg:grid-cols-[1fr_1fr_1fr_180px_auto]"
          onSubmit={createAccount}
        >
          <div className="space-y-2">
            <Label htmlFor="new-email">Email</Label>
            <Input
              id="new-email"
              type="email"
              value={newUser.email}
              onChange={(event) => setNewUser((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-name">Name</Label>
            <Input
              id="new-name"
              value={newUser.displayName}
              onChange={(event) =>
                setNewUser((prev) => ({ ...prev, displayName: event.target.value }))
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newUser.password}
              onChange={(event) =>
                setNewUser((prev) => ({ ...prev, password: event.target.value }))
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={newUser.role}
              onValueChange={(value) => setNewUser((prev) => ({ ...prev, role: value as Role }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full gap-2">
              <UserPlus className="size-4" />
              Create
            </Button>
          </div>
        </form>

        {(error || notice) && (
          <div
            className={
              error
                ? 'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
                : 'rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300'
            }
          >
            {error || notice}
          </div>
        )}

        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-[1.5fr_130px_130px_180px_220px] border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-normal text-muted-foreground">
            <div>User</div>
            <div>Role</div>
            <div>Status</div>
            <div>Last login</div>
            <div>Password</div>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">Loading</div>
            ) : (
              sortedUsers.map((user) => (
                <div
                  key={user.id}
                  className="grid grid-cols-[1.5fr_130px_130px_180px_220px] items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{user.displayName}</div>
                    <div className="truncate text-sm text-muted-foreground">{user.email}</div>
                  </div>
                  <Select
                    value={user.role}
                    disabled={savingUserId === user.id || user.id === currentUserId}
                    onValueChange={(value) => patchUser(user.id, { role: value as Role })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={user.status}
                    disabled={savingUserId === user.id || user.id === currentUserId}
                    onValueChange={(value) => patchUser(user.id, { status: value as Status })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div>
                    <Badge variant={user.lastLoginAt ? 'secondary' : 'outline'}>
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}
                    </Badge>
                  </div>
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const password = passwordDrafts[user.id]?.trim();
                      if (password) patchUser(user.id, { password });
                    }}
                  >
                    <Input
                      className="h-9"
                      type="password"
                      placeholder="New password"
                      value={passwordDrafts[user.id] || ''}
                      onChange={(event) =>
                        setPasswordDrafts((prev) => ({ ...prev, [user.id]: event.target.value }))
                      }
                    />
                    <Button
                      type="submit"
                      size="icon"
                      variant="outline"
                      disabled={!passwordDrafts[user.id] || savingUserId === user.id}
                      title="Reset password"
                    >
                      {savingUserId === user.id ? (
                        <Save className="size-4" />
                      ) : passwordDrafts[user.id] ? (
                        <Check className="size-4" />
                      ) : (
                        <KeyRound className="size-4" />
                      )}
                    </Button>
                  </form>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-medium">Recent classrooms</h2>
            </div>
            <div className="divide-y divide-border">
              {recentClassrooms.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">No classroom records</div>
              ) : (
                recentClassrooms.map((classroom) => (
                  <div key={classroom.id} className="px-4 py-3">
                    <div className="truncate font-medium">{classroom.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{classroom.sceneCount} scenes</span>
                      <span>{classroom.ownerEmail || 'No owner'}</span>
                      <span>{new Date(classroom.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-medium">Recent generation jobs</h2>
            </div>
            <div className="divide-y divide-border">
              {recentJobs.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">No generation jobs</div>
              ) : (
                recentJobs.map((job) => (
                  <div key={job.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate font-medium">{job.id}</div>
                      <Badge variant={job.status === 'failed' ? 'destructive' : 'secondary'}>
                        {job.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{job.progress}%</span>
                      <span>{job.step || 'queued'}</span>
                      <span>{job.ownerEmail || 'No owner'}</span>
                      <span>{new Date(job.createdAt).toLocaleString()}</span>
                    </div>
                    {job.error && <p className="mt-2 text-xs text-destructive">{job.error}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
