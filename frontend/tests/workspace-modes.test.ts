import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('student and teacher workspace modes', () => {
  it('renders the shared left sidebar and enables the teacher workbench', () => {
    expect(read('components/workspace/workspace-shell.tsx')).toContain('RoleSidebar');
    expect(read('app/(workspace)/teacher/page.tsx')).toContain('<TeacherWorkbench');

    const sidebar = read('components/workspace/role-sidebar.tsx');
    expect(sidebar).toContain("href: '/student'");
    expect(sidebar).toContain("href: '/teacher'");
    expect(sidebar).not.toContain("href: '/parent'");
  });

  it('defaults every successful login to student mode unless next is safe', () => {
    const login = read('app/login/page.tsx');
    expect(login).toContain("getSafeReturnPath(searchParams.get('next'), '/student')");
    expect(login).not.toContain("role === 'admin'");
  });

  it('keeps student mode free of legacy settings and agent controls', () => {
    const student = read('app/(workspace)/student/page.tsx');
    for (const forbidden of ['LanguageSwitcher', 'SettingsDialog', '<AgentBar', 'setSettingsOpen']) {
      expect(student).not.toContain(forbidden);
    }
  });

  it('protects the admin page with a database-backed role check', () => {
    const source = read('app/(workspace)/admin/page.tsx');
    expect(source).toContain("requireRole(['admin'])");
    expect(source).toContain('<AdminDashboard');
  });

  it('removes legacy teacher and parent account roles', () => {
    expect(read('lib/server/auth-types.ts')).toContain("['student', 'admin']");
    const migration = read('db/migrations/003_workspace_modes.sql');
    expect(migration).toContain("WHERE role IN ('teacher', 'parent')");
    expect(migration).toContain("CHECK (role IN ('student', 'admin'))");
  });

  it('removes the legacy access-code login layer', () => {
    expect(read('app/layout.tsx')).not.toContain('AccessCodeGuard');
    expect(read('proxy.ts')).not.toContain('/api/access-code/');
  });

  it('marks the document as Chinese and keeps the product locale fixed', () => {
    expect(read('app/layout.tsx')).toContain('<html lang="zh-CN"');
    const source = read('lib/hooks/use-i18n.tsx');
    expect(source).toContain("const PRODUCT_LOCALE: Locale = 'zh-CN'");
    expect(source).not.toContain('navigator.language');
  });
});
