# 星燧落地页与单学生端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `origin/frontend` 落地页等效迁移到 Next.js，并把 OpenMAIC 裁剪为中文、单学生端、单教师 Agent 产品。

**Architecture:** 根路由渲染客户端落地页组件，复杂原始视觉放在命名空间 CSS，常规结构使用 Tailwind。落地页通过 preset 查询参数进入学生页，学生页创建 generation session 并自动跳转；Agent profile API 与 fallback 都只产生一个教师。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Tailwind CSS v4、Motion、Vitest。

## Global Constraints

- 保持 `origin/frontend` 四屏落地页的图片、文案、布局和交互效果。
- Tailwind v4 继续使用现有 `@tailwindcss/postcss` 配置。
- 神话入口使用 `myth` 固定中文提示词；回收火箭使用 `rocket` 固定中文提示词并立即生成。
- 普通 `/student` 不自动生成。
- 前台只显示中文学生端，课堂仅有一个教师 Agent。
- 不修改 `.github/workflows/ci-cd.yml` 与 `README.md` 的现有未提交改动。

---

### Task 1: Preset contract and automatic generation

**Files:**
- Create: `frontend/lib/presets/student-presets.ts`
- Create: `frontend/tests/student-presets.test.ts`
- Modify: `frontend/app/(workspace)/student/page.tsx`

**Interfaces:**
- Produces: `StudentPresetKey`, `STUDENT_PRESETS`, `resolveStudentPreset(value)`.
- Consumes: `/student?preset=myth|rocket`.

- [ ] Write tests asserting `myth` and `rocket` return non-empty Chinese prompts and unknown values return `null`.
- [ ] Run `pnpm vitest run tests/student-presets.test.ts` and verify missing-module failure.
- [ ] Implement the typed preset map and resolver.
- [ ] Refactor student generation preparation into `startGeneration(requirement: string)` and add a guarded preset effect that runs once when a usable provider exists.
- [ ] Run the preset test and existing frontend tests.

### Task 2: Next.js landing page migration

**Files:**
- Create: `frontend/components/landing/landing-page.tsx`
- Create: `frontend/app/landing.css`
- Modify: `frontend/app/page.tsx`
- Copy from `origin/frontend`: image files to `frontend/public/landing/`
- Create: `frontend/tests/landing-page.test.tsx`

**Interfaces:**
- Produces: root landing page and routes `/student?preset=myth`, `/student?preset=rocket`, `/student`.

- [ ] Write a component test for the title, four myth links, rocket link, direct experience link, and section ids.
- [ ] Run it and verify failure because the landing component does not exist.
- [ ] Copy the ten branch images into `public/landing/`.
- [ ] Implement the four sections with semantic Next.js/React markup and Tailwind utilities.
- [ ] Port the complex namespaced visual CSS from `origin/frontend:styles.css`, updating URLs to `/landing/*`.
- [ ] Add IntersectionObserver reveal, requestAnimationFrame parallax, smooth button/keyboard navigation, and reduced-motion handling.
- [ ] Replace root redirect with the landing page and import `landing.css`.
- [ ] Run landing tests and production build.

### Task 3: Student-only Chinese shell

**Files:**
- Modify: `frontend/components/workspace/workspace-shell.tsx`
- Modify: `frontend/app/(workspace)/student/page.tsx`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/login/page.tsx`
- Modify: `frontend/app/register/page.tsx`
- Modify: `frontend/app/(workspace)/teacher/page.tsx`
- Modify: `frontend/app/(workspace)/parent/page.tsx`
- Modify: `frontend/app/(workspace)/admin/page.tsx`
- Create: `frontend/tests/student-only-shell.test.tsx`

**Interfaces:**
- Produces: no role sidebar, no language/model/agent settings UI, Chinese auth/student surface, legacy role redirects.

- [ ] Write source-level/component assertions that forbidden controls are absent and legacy role pages redirect to `/student`.
- [ ] Verify tests fail against current multi-role UI.
- [ ] Remove RoleSidebar from WorkspaceShell and remove student page imports/state/markup for LanguageSwitcher, theme selector, SettingsDialog, AgentBar and provider-settings affordances.
- [ ] Set root metadata and `<html lang>` to Chinese.
- [ ] Translate login/register visible strings to Chinese.
- [ ] Replace teacher/parent/admin pages with server redirects to `/student`.
- [ ] Run targeted and full tests.

### Task 4: Single-teacher generation

**Files:**
- Modify: `frontend/app/api/generate/agent-profiles/route.ts`
- Modify: `frontend/app/generation-preview/page.tsx`
- Create: `frontend/tests/single-teacher-agents.test.ts`

**Interfaces:**
- Produces: exactly one teacher agent for generated and fallback paths.

- [ ] Write tests for normalization: multiple agents -> one teacher; no teacher -> first normalized as teacher; empty -> error.
- [ ] Verify the tests fail against current 3–5 Agent behavior.
- [ ] Extract and implement `normalizeSingleTeacherAgent`.
- [ ] Rewrite API prompts and validation for exactly one teacher.
- [ ] Reduce generation-preview fallback profiles to one teacher.
- [ ] Run targeted and full tests.

### Task 5: Verification and review

**Files:**
- Verify all files above.
- Add this plan document to the implementation commit.

**Interfaces:**
- Produces: reviewable, buildable feature with preserved unrelated working-tree changes.

- [ ] Run `pnpm test` and `pnpm build` with the repository-supported Node runtime.
- [ ] Verify every `/landing/*` resource referenced by the component exists.
- [ ] Run `git diff --check` only on task files.
- [ ] Confirm `.github/workflows/ci-cd.yml` and `README.md` remain unstaged and byte-identical to their pre-task dirty state.
- [ ] Run code review and address all Critical/Important findings.
- [ ] Commit only frontend task files and this plan.
