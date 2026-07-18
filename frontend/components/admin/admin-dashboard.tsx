'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  KeyRound,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/auth/validation';
import { Badge } from '@/components/ui/badge';
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

type Role = 'student' | 'admin';
type Status = 'active' | 'disabled';

interface AdminUser {
  id: string;
  loginIdentifier: string;
  identifierType: 'email' | 'phone';
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
  disabledUsers: number;
}

interface RecentClassroom {
  id: string;
  title: string;
  sceneCount: number;
  createdAt: string;
  ownerIdentifier: string | null;
}

interface RecentJob {
  id: string;
  status: string;
  step: string | null;
  progress: number;
  error: string | null;
  createdAt: string;
  ownerIdentifier: string | null;
}

interface AuditEvent {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  actorIdentifier: string | null;
}

const ROLE_OPTIONS: Role[] = ['student', 'admin'];
const STATUS_OPTIONS: Status[] = ['active', 'disabled'];
const ROLE_LABELS: Record<Role, string> = {
  student: '学生',
  admin: '管理员',
};
const STATUS_LABELS: Record<Status, string> = { active: '正常', disabled: '已停用' };

export function AdminDashboard({
  currentUserId,
  currentUserName,
}: {
  currentUserId: string;
  currentUserName: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recentClassrooms, setRecentClassrooms] = useState<RecentClassroom[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    identifier: '',
    displayName: '',
    password: '',
    confirmPassword: '',
    role: 'student' as Role,
  });
  const [passwordDrafts, setPasswordDrafts] = useState<
    Record<string, { password: string; confirmPassword: string }>
  >({});

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (user) =>
        user.displayName.toLowerCase().includes(needle) ||
        user.loginIdentifier.toLowerCase().includes(needle),
    );
  }, [search, users]);

  const readJson = useCallback(async (response: Response) => {
    const data = await response.json();
    if (response.status === 401) {
      router.replace('/login?next=/admin');
      throw new Error('登录状态已失效，请重新登录');
    }
    if (!response.ok || !data.success) throw new Error(data.error || '请求失败');
    return data;
  }, [router]);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, usersData] = await Promise.all([
        fetch('/api/admin/overview', { cache: 'no-store' }).then(readJson),
        fetch('/api/admin/users?limit=200', { cache: 'no-store' }).then(readJson),
      ]);
      setOverview(overviewData.overview);
      setRecentClassrooms(overviewData.recentClassrooms || []);
      setRecentJobs(overviewData.recentJobs || []);
      setRecentAuditLogs(overviewData.recentAuditLogs || []);
      setUsers(usersData.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '后台数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [readJson]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const data = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      }).then(readJson);
      setUsers((current) => [data.user, ...current]);
      setNewUser({
        identifier: '',
        displayName: '',
        password: '',
        confirmPassword: '',
        role: 'student',
      });
      setNotice('账号已创建');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '账号创建失败');
    }
  }

  async function patchUser(
    userId: string,
    patch: Partial<AdminUser> & { password?: string; confirmPassword?: string },
  ) {
    setSavingUserId(userId);
    setError(null);
    setNotice(null);
    try {
      const data = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).then(readJson);
      setUsers((current) => current.map((user) => (user.id === userId ? data.user : user)));
      if (patch.password) {
        setPasswordDrafts((current) => ({
          ...current,
          [userId]: { password: '', confirmPassword: '' },
        }));
      }
      setNotice(patch.password ? '密码已更新，旧会话已全部失效' : '用户已更新');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '用户更新失败');
    } finally {
      setSavingUserId(null);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const metrics = overview
    ? [
        { label: '全部用户', value: overview.users, icon: Users },
        { label: '活跃会话', value: overview.activeSessions, icon: Activity },
        { label: '已停用', value: overview.disabledUsers, icon: ShieldCheck },
        { label: '课程', value: overview.classrooms, icon: BookOpen },
        { label: '生成任务', value: overview.generationJobs, icon: CheckCircle2 },
        { label: '失败任务', value: overview.failedJobs, icon: RefreshCw },
      ]
    : [];

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-7 px-5 py-6 lg:px-10 lg:py-9">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-amber-300">
              <ShieldCheck className="size-4" /> Sophos · 星燧管理中心
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">管理员后台</h1>
            <p className="mt-2 text-sm text-slate-400">当前管理员：{currentUserName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-transparent text-slate-100"
            >
              <Link href="/student">返回学生端</Link>
            </Button>
            <Button
              variant="outline"
              className="gap-2 border-white/15 bg-transparent text-slate-100"
              onClick={() => void loadAdminData()}
              disabled={loading}
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
            </Button>
            <Button variant="secondary" className="gap-2" onClick={logout}>
              <LogOut className="size-4" /> 退出
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {metrics.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between text-sm text-slate-400">
                {label} <Icon className="size-4 text-amber-300" />
              </div>
              <p className="mt-4 text-3xl font-semibold">{value}</p>
            </div>
          ))}
        </section>

        {(error || notice) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              error
                ? 'border-red-400/30 bg-red-400/10 text-red-200'
                : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
            }`}
          >
            {error || notice}
          </div>
        )}

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-5">
            <h2 className="text-lg font-medium">创建账号</h2>
            <p className="mt-1 text-sm text-slate-400">
              支持手机号或邮箱；普通注册默认创建学生账号。
            </p>
          </div>
          <form className="grid gap-4 lg:grid-cols-5" onSubmit={createAccount}>
            <div className="space-y-2">
              <Label htmlFor="new-identifier">手机号或邮箱</Label>
              <Input
                id="new-identifier"
                className="border-white/10 bg-slate-900"
                value={newUser.identifier}
                onChange={(event) =>
                  setNewUser((current) => ({ ...current, identifier: event.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-name">昵称</Label>
              <Input
                id="new-name"
                className="border-white/10 bg-slate-900"
                value={newUser.displayName}
                onChange={(event) =>
                  setNewUser((current) => ({ ...current, displayName: event.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">密码</Label>
              <Input
                id="new-password"
                type="password"
                className="border-white/10 bg-slate-900"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                value={newUser.password}
                onChange={(event) =>
                  setNewUser((current) => ({ ...current, password: event.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-confirm-password">确认密码</Label>
              <Input
                id="new-confirm-password"
                type="password"
                className="border-white/10 bg-slate-900"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                value={newUser.confirmPassword}
                onChange={(event) =>
                  setNewUser((current) => ({ ...current, confirmPassword: event.target.value }))
                }
                required
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="space-y-2">
                <Label>角色</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(value) =>
                    setNewUser((current) => ({ ...current, role: value as Role }))
                  }
                >
                  <SelectTrigger className="border-white/10 bg-slate-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  className="gap-2 bg-amber-300 text-slate-950 hover:bg-amber-200"
                >
                  <UserPlus className="size-4" /> 创建
                </Button>
              </div>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="text-lg font-medium">用户与权限</h2>
              <p className="mt-1 text-sm text-slate-400">
                更改权限、状态或密码会立即撤销该用户全部会话。
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                className="border-white/10 bg-slate-900 pl-9"
                placeholder="搜索昵称或账号"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="divide-y divide-white/10">
            {loading ? (
              <div className="px-5 py-10 text-sm text-slate-400">正在加载</div>
            ) : filteredUsers.length === 0 ? (
              <div className="px-5 py-10 text-sm text-slate-400">没有匹配用户</div>
            ) : (
              filteredUsers.map((user) => {
                const draft = passwordDrafts[user.id] || { password: '', confirmPassword: '' };
                const isSelf = user.id === currentUserId;
                return (
                  <div
                    key={user.id}
                    className="grid gap-4 px-5 py-4 xl:grid-cols-[1.4fr_150px_150px_180px_1.4fr] xl:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{user.displayName}</span>
                        {isSelf && <Badge className="bg-amber-300 text-slate-950">当前账号</Badge>}
                      </div>
                      <div className="mt-1 truncate text-sm text-slate-400">
                        {user.loginIdentifier} · {user.identifierType === 'email' ? '邮箱' : '手机'}
                      </div>
                    </div>
                    <Select
                      value={user.role}
                      disabled={savingUserId === user.id || isSelf}
                      onValueChange={(value) => void patchUser(user.id, { role: value as Role })}
                    >
                      <SelectTrigger className="border-white/10 bg-slate-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={user.status}
                      disabled={savingUserId === user.id || isSelf}
                      onValueChange={(value) =>
                        void patchUser(user.id, { status: value as Status })
                      }
                    >
                      <SelectTrigger className="border-white/10 bg-slate-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-sm text-slate-400">
                      <div>
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleString('zh-CN')
                          : '从未登录'}
                      </div>
                      <div className="mt-1 text-xs">
                        注册于 {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                      </div>
                    </div>
                    <form
                      className="grid grid-cols-[1fr_1fr_auto] gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (draft.password && draft.confirmPassword) {
                          void patchUser(user.id, draft);
                        }
                      }}
                    >
                      <Input
                        type="password"
                        placeholder="新密码"
                        aria-label={`${user.displayName} 的新密码`}
                        minLength={PASSWORD_MIN_LENGTH}
                        maxLength={PASSWORD_MAX_LENGTH}
                        className="border-white/10 bg-slate-900"
                        value={draft.password}
                        onChange={(event) =>
                          setPasswordDrafts((current) => ({
                            ...current,
                            [user.id]: { ...draft, password: event.target.value },
                          }))
                        }
                      />
                      <Input
                        type="password"
                        placeholder="确认密码"
                        aria-label={`确认 ${user.displayName} 的新密码`}
                        minLength={PASSWORD_MIN_LENGTH}
                        maxLength={PASSWORD_MAX_LENGTH}
                        className="border-white/10 bg-slate-900"
                        value={draft.confirmPassword}
                        onChange={(event) =>
                          setPasswordDrafts((current) => ({
                            ...current,
                            [user.id]: { ...draft, confirmPassword: event.target.value },
                          }))
                        }
                      />
                      <Button
                        type="submit"
                        size="icon"
                        variant="outline"
                        className="border-white/10 bg-slate-900"
                        disabled={
                          !draft.password || !draft.confirmPassword || savingUserId === user.id
                        }
                        title="重置密码"
                      >
                        <KeyRound className="size-4" />
                      </Button>
                    </form>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <AdminFeed title="最近课程">
            {recentClassrooms.length === 0 ? (
              <EmptyFeed />
            ) : (
              recentClassrooms.map((classroom) => (
                <FeedRow key={classroom.id} title={classroom.title}>
                  {classroom.sceneCount} 个场景 · {classroom.ownerIdentifier || '未关联用户'}
                </FeedRow>
              ))
            )}
          </AdminFeed>
          <AdminFeed title="最近生成任务">
            {recentJobs.length === 0 ? (
              <EmptyFeed />
            ) : (
              recentJobs.map((job) => (
                <FeedRow
                  key={job.id}
                  title={`${job.status} · ${job.progress}%`}
                  danger={job.status === 'failed'}
                >
                  {job.step || '排队中'} · {job.ownerIdentifier || '未关联用户'}
                  {job.error ? ` · ${job.error}` : ''}
                </FeedRow>
              ))
            )}
          </AdminFeed>
          <AdminFeed title="安全审计记录">
            {recentAuditLogs.length === 0 ? (
              <EmptyFeed />
            ) : (
              recentAuditLogs.map((event) => (
                <FeedRow key={event.id} title={event.action}>
                  {event.actorIdentifier || '系统'} ·{' '}
                  {new Date(event.createdAt).toLocaleString('zh-CN')}
                </FeedRow>
              ))
            )}
          </AdminFeed>
        </section>
      </div>
    </main>
  );
}

function AdminFeed({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
      <h2 className="border-b border-white/10 px-5 py-4 font-medium">{title}</h2>
      <div className="divide-y divide-white/10">{children}</div>
    </div>
  );
}

function FeedRow({
  title,
  danger,
  children,
}: {
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <div className={`truncate text-sm font-medium ${danger ? 'text-red-300' : ''}`}>{title}</div>
      <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{children}</div>
    </div>
  );
}

function EmptyFeed() {
  return <div className="px-5 py-8 text-sm text-slate-500">暂无记录</div>;
}
