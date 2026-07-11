import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('student-only shell', () => {
  it('does not render role, language, settings, or agent controls', () => {
    expect(read('components/workspace/workspace-shell.tsx')).not.toContain('RoleSidebar');
    const student = read('app/(workspace)/student/page.tsx');
    for (const forbidden of ['LanguageSwitcher', 'SettingsDialog', '<AgentBar', 'setSettingsOpen']) {
      expect(student).not.toContain(forbidden);
    }
  });

  it.each(['teacher', 'parent', 'admin'])('redirects the %s route to student', (role) => {
    const source = read(`app/(workspace)/${role}/page.tsx`);
    expect(source).toContain("redirect('/student')");
  });

  it('marks the document as Chinese', () => {
    expect(read('app/layout.tsx')).toContain('<html lang="zh-CN"');
  });

  it('locks the i18n provider to Chinese', () => {
    const source = read('lib/hooks/use-i18n.tsx');
    expect(source).toContain("const PRODUCT_LOCALE: Locale = 'zh-CN'");
    expect(source).not.toContain('navigator.language');
  });
});
