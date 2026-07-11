# Static Assets Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-stage the production frontend `public/` directory on the deployment server and reduce routine GitHub Actions transfers by excluding persistent and non-production static assets.

**Architecture:** `/home/ubuntu/moonbot-static/frontend-public/` is the persistent server-side source for production public files. GitHub Actions transfers only application source, validates the persistent directory, restores it into the temporary frontend Docker context, then builds and replaces containers after all images succeed.

**Tech Stack:** GitHub Actions YAML, Bash, tar, sshpass/SCP/SSH, Docker, Next.js standalone output, Markdown.

## Global Constraints

- Persist production static files at exactly `/home/ubuntu/moonbot-static/frontend-public/`.
- Exclude both `frontend/public/` and the unused README/demo `frontend/assets/` directory from routine deployment archives.
- Do not embed the SSH password in repository files or documentation.
- Keep current production containers running until all three Docker images build successfully.
- Fail before Docker build if the persistent static directory is missing or empty.
- Keep password-based deployment in this change; SSH-key migration is separate work.

---

### Task 1: Initialize persistent frontend public files

**Files:**
- Read: `frontend/public/**`
- Create locally (temporary): `/tmp/moonbot-frontend-public.tar.gz`
- Create remotely: `/home/ubuntu/moonbot-static/frontend-public/**`

**Interfaces:**
- Consumes: committed files below `frontend/public/` and SSH access as `ubuntu@82.157.189.119`.
- Produces: a non-empty `/home/ubuntu/moonbot-static/frontend-public/` directory consumed by the deployment workflow.

- [ ] **Step 1: Record the local source inventory**

Run:

```bash
find frontend/public -type f | LC_ALL=C sort | wc -l
du -sk frontend/public
```

Expected: a non-zero file count and size.

- [ ] **Step 2: Create the static archive**

Run:

```bash
COPYFILE_DISABLE=1 tar -C frontend/public \
  -czf /tmp/moonbot-frontend-public.tar.gz .
tar -tzf /tmp/moonbot-frontend-public.tar.gz >/dev/null
ls -lh /tmp/moonbot-frontend-public.tar.gz
```

Expected: tar validation exits 0, the archive is approximately 3–7 MB, and no
macOS `._*` metadata files are created on the Linux server.

- [ ] **Step 3: Upload under a temporary remote name**

Run with `SSHPASS` supplied outside shell history:

```bash
SSHPASS='<password>' sshpass -e scp \
  -o StrictHostKeyChecking=no \
  -o ConnectTimeout=20 \
  /tmp/moonbot-frontend-public.tar.gz \
  ubuntu@82.157.189.119:/home/ubuntu/moonbot-frontend-public.tar.gz
```

Expected: SCP exits 0.

- [ ] **Step 4: Extract, validate, and swap the persistent directory**

Run:

```bash
SSHPASS='<password>' sshpass -e ssh \
  -o StrictHostKeyChecking=no \
  -o ConnectTimeout=20 \
  ubuntu@82.157.189.119 \
  'set -e; cd /home/ubuntu; rm -rf moonbot-static/frontend-public.new; mkdir -p moonbot-static/frontend-public.new; tar xzf moonbot-frontend-public.tar.gz -C moonbot-static/frontend-public.new; test -n "$(find moonbot-static/frontend-public.new -type f -print -quit)"; rm -rf moonbot-static/frontend-public.old; if [ -d moonbot-static/frontend-public ]; then mv moonbot-static/frontend-public moonbot-static/frontend-public.old; fi; mv moonbot-static/frontend-public.new moonbot-static/frontend-public; find moonbot-static/frontend-public -type f | wc -l; du -sh moonbot-static/frontend-public'
```

Expected: remote count and size are non-zero and agree with the local inventory in practical terms.

---

### Task 2: Make routine deployment restore persistent static files

**Files:**
- Modify: `.github/workflows/ci-cd.yml:53-135`
- Test: temporary deployment archive and YAML parse checks

**Interfaces:**
- Consumes: `/home/$SERVER_USER/moonbot-static/frontend-public/` created by Task 1 and existing GitHub secrets.
- Produces: `moonbot-frontend-src/public/` before `docker build -t moonbot-frontend:ci`.

- [ ] **Step 1: Capture the current archive behavior as a failing check**

Run:

```bash
tar -C frontend --exclude=node_modules --exclude=.next --exclude=.git --exclude=tests --exclude=.pnpm-store -czf /tmp/frontend-before.tar.gz .
tar -tzf /tmp/frontend-before.tar.gz | grep -E '^\./(assets|public)/' | head
```

Expected before the workflow change: output includes at least one `./assets/` or `./public/` entry.

- [ ] **Step 2: Add transfer limits and archive observability**

Modify the deploy job to include:

```yaml
  deploy:
    name: Ship & build & run on server
    runs-on: ubuntu-latest
    timeout-minutes: 60
```

Replace the frontend tar command and add archive reporting:

```bash
tar -C frontend \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.git \
  --exclude=tests \
  --exclude=.pnpm-store \
  --exclude=assets \
  --exclude=public \
  -czf frontend-deploy.tar .
ls -lh backend-deploy.tar c2v-deploy.tar frontend-deploy.tar
```

- [ ] **Step 3: Serialize secrets safely and restore static files remotely**

Stream Bash-escaped assignments followed by a quoted heredoc so secret values
are not expanded into remote shell syntax and are never staged in a plaintext
file:

```bash
{
  printf 'set -e\n'
  printf 'C2V_LLM_API_KEY=%q\n' "$C2V_LLM_API_KEY"
  printf 'C2V_LLM_BASE_URL=%q\n' "$C2V_LLM_BASE_URL"
  printf 'C2V_LLM_MODEL=%q\n' "$C2V_LLM_MODEL"
  printf 'C2V_FIX_MODEL=%q\n' "$C2V_FIX_MODEL"
  printf 'C2V_TTS_DOUBAO_KEY=%q\n' "$C2V_TTS_DOUBAO_KEY"
  printf 'DEEPSEEK_API_KEY=%q\n' "$DEEPSEEK_API_KEY"
  cat <<'REMOTE_SCRIPT'
cd ~
```

Immediately after extracting `frontend-deploy.tar` inside that quoted heredoc,
add the static restore block below. Close the stream with:

```bash
REMOTE_SCRIPT
} | sshpass -p "$SERVER_PASSWORD" ssh $SSHOPTS "$REMOTE" 'bash -s'
```

Static restore block:

```bash
STATIC_PUBLIC="$HOME/moonbot-static/frontend-public"
if [ ! -d "$STATIC_PUBLIC" ] || [ -z "$(find "$STATIC_PUBLIC" -type f -print -quit)" ]; then
  echo "ERROR: persistent frontend public directory is missing or empty: $STATIC_PUBLIC" >&2
  echo "Run the static-resource initialization documented in README.md." >&2
  exit 1
fi
cp -a "$STATIC_PUBLIC" moonbot-frontend-src/public
echo "Restored persistent frontend public files:"
du -sh moonbot-frontend-src/public
```

- [ ] **Step 4: Make Docker progress stages explicit**

Replace the three build commands with:

```bash
echo "::group::Build code2video image"
docker build --progress=plain -t moonbot-code2video:ci moonbot-c2v-src
echo "::endgroup::"

echo "::group::Build backend image"
docker build --progress=plain -t moonbot-backend:ci moonbot-backend-src
echo "::endgroup::"

echo "::group::Build frontend image"
docker build --progress=plain -t moonbot-frontend:ci moonbot-frontend-src
echo "::endgroup::"
```

- [ ] **Step 5: Verify the reduced archive**

Run the revised tar command locally, then:

```bash
test -z "$(tar -tzf /tmp/frontend-after.tar.gz | grep -E '^\./(assets|public)/' || true)"
test "$(stat -f '%z' /tmp/frontend-after.tar.gz)" -lt 20000000
```

Expected on macOS: both checks exit 0; the archive is below 20 MB and contains neither excluded directory.

- [ ] **Step 6: Validate workflow syntax and whitespace**

Run:

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci-cd.yml"); puts "workflow yaml ok"'
git diff --check
```

Expected: `workflow yaml ok`; `git diff --check` exits 0.

---

### Task 3: Document deployment operation

**Files:**
- Modify: `README.md:30-59`

**Interfaces:**
- Consumes: the exact persistent path and commands defined by Tasks 1–2.
- Produces: operator instructions for initialization, updates, routine CI/CD, verification, and troubleshooting.

- [ ] **Step 1: Correct stale architecture and deployment claims**

Update README to describe the current OpenMAIC frontend, direct SSH source deployment, frontend port `8089`, backend port `8088`, and required secrets. Remove the stale GHCR and “skeleton only” claims.

- [ ] **Step 2: Add initial static-resource setup commands**

Document commands that:

```bash
COPYFILE_DISABLE=1 tar -C frontend/public \
  -czf /tmp/moonbot-frontend-public.tar.gz .
SSHPASS='<password>' sshpass -e scp /tmp/moonbot-frontend-public.tar.gz ubuntu@82.157.189.119:/home/ubuntu/
```

Then document the remote extraction/swap command from Task 1 without a literal password.

- [ ] **Step 3: Add routine deployment and update rules**

State explicitly:

- A push to `main` runs backend/frontend tests and then deploys.
- Routine archives exclude `frontend/assets/` and `frontend/public/`.
- Any committed change below `frontend/public/` requires rerunning static-resource synchronization.
- Existing containers remain live until image builds complete.

- [ ] **Step 4: Add verification and troubleshooting commands**

Include:

```bash
curl -f http://82.157.189.119:8089/
curl -f http://82.157.189.119:8088/health
ssh ubuntu@82.157.189.119 'docker ps --filter name=moonbot'
```

Explain that a missing/empty `/home/ubuntu/moonbot-static/frontend-public/` intentionally fails deployment before Docker build.

- [ ] **Step 5: Review documentation for secrets and consistency**

Run:

```bash
rg -n 'SERVER_PASSWORD=[^$]|sshpass -p [^"$]' README.md .github/workflows/ci-cd.yml
rg -n 'moonbot-static/frontend-public|8088|8089' README.md .github/workflows/ci-cd.yml
git diff --check
```

Expected: the first command has no matches; the second shows matching paths and ports; whitespace check exits 0.

---

### Task 4: Verify the complete change and deploy safely

**Files:**
- Verify: `.github/workflows/ci-cd.yml`
- Verify: `README.md`
- Verify remotely: `/home/ubuntu/moonbot-static/frontend-public/**`

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: evidence that source archives are small, application tests pass, static files exist remotely, and current production remains reachable.

- [ ] **Step 1: Run backend verification**

Run:

```bash
cd backend && npm test && npm run build
```

Expected: 24 tests pass and NestJS build exits 0.

- [ ] **Step 2: Run frontend verification**

Run:

```bash
cd frontend && pnpm test && pnpm build
```

Expected: tests and Next.js production build exit 0.

- [ ] **Step 3: Recheck the remote static inventory**

Run:

```bash
SSHPASS='<password>' sshpass -e ssh ubuntu@82.157.189.119 \
  'test -n "$(find /home/ubuntu/moonbot-static/frontend-public -type f -print -quit)" && find /home/ubuntu/moonbot-static/frontend-public -type f | wc -l && du -sh /home/ubuntu/moonbot-static/frontend-public'
```

Expected: exit 0, with non-zero count and size.

- [ ] **Step 4: Verify current production before handing off**

Run:

```bash
curl -fsS -o /dev/null -w 'frontend %{http_code}\n' http://82.157.189.119:8089/
curl -fsS -o /dev/null -w 'backend %{http_code}\n' http://82.157.189.119:8088/health
```

Expected: both report HTTP 200.

- [ ] **Step 5: Commit implementation and documentation**

Run:

```bash
git add .github/workflows/ci-cd.yml README.md docs/superpowers/plans/2026-07-11-static-assets-deployment.md
git commit -m "fix(ci): persist frontend static assets"
```

Expected: one commit containing only the workflow, README, and implementation plan changes.
