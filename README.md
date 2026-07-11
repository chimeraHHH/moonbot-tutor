# moonbot-tutor

AI-driven teaching platform that combines the complete Real-Time Tutor project
with Moonbot's student-facing UI, NestJS BFF, Deep Solve service, and production
deployment. A question or topic can be turned into an interactive classroom and
a narrated **Manim explainer video**.

The frontend is ported from [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)
and its `real-time-tutor` fork. Deep Solve video requests use the API contract
in `openapi.yaml` and flow through the NestJS backend to code2video.

## Architecture

```
Moonbot frontend/ (production UI) ──REST──► backend/ (NestJS BFF)
                                                │
Root Real-Time Tutor app ───────────────────────┼──► services/code2video/
                                                │    (FastAPI + Manim)
                                                ▼
                                         shared API contract
```

- **Repository root** — the complete Real-Time Tutor Next.js application,
  including classroom generation, agents, editing, evaluation, and tests.
- **`frontend/`** — Moonbot's Next.js/OpenMAIC student UI (pnpm workspace).
  This is the UI deployed by the Moonbot CI/CD workflow.
- **`backend/`** — NestJS (TypeScript + Vitest + npm). Thin BFF that implements
  the `openapi.yaml` contract and forwards to the FastAPI service.
- **`services/code2video/`** — FastAPI "Deep Solve" pipeline
  (`llm1 → llm2 → storyboard → audio → code → render → merge`).
- **LLM**: Claude via `byteswarm.ai` relay. **TTS**: Doubao. **Manim**: ManimCE.

## Layout

```
app/, components/, lib/  Complete root Real-Time Tutor application
backend/                 Moonbot NestJS BFF (TS + Vitest + npm)
frontend/                Moonbot Next.js/OpenMAIC student UI (pnpm)
services/code2video/     FastAPI Manim service
openapi.yaml             the API contract
docker-compose.yml       orchestration
.github/workflows/       CI/CD (build → test → SCP → remote Docker build)
```

## Develop (complete root application)

```bash
pnpm install
cp .env.example .env.local
pnpm dev                 # http://localhost:3000
```

## Develop (Moonbot UI)

```bash
cd frontend
pnpm install
pnpm dev                 # choose a free port if the root app is running
```

## Develop (backend)

```bash
cd backend
npm install
npm run start:dev   # http://localhost:3000
npm test
```

## Run the combined stack with Docker Compose

The compose file keeps the complete root application and Moonbot services
available together. Moonbot's UI is exposed on port `8089`, its BFF on `8088`,
and the root application on `3000`.

```bash
docker compose --env-file .env.local up --build
```

## Required GitHub secrets (for CI/CD deploy)

- `SERVER_HOST` — `82.157.189.119`
- `SERVER_USER` — SSH user (`ubuntu` on the current server)
- `SERVER_PASSWORD` — SSH password
- `C2V_LLM_API_KEY`, `C2V_LLM_BASE_URL`, `C2V_LLM_MODEL`, `C2V_FIX_MODEL`
- `C2V_TTS_DOUBAO_KEY`
- `DEEPSEEK_API_KEY`

## Production deployment

Production currently runs directly on `82.157.189.119`:

- Frontend: `http://82.157.189.119:8089`
- Backend health: `http://82.157.189.119:8088/health`

A push to `main` runs backend and frontend tests, creates three source
archives, transfers them over SSH, builds Docker images on the server, and
replaces the containers. Existing containers remain running until all images
have built successfully.

### Initialize persistent frontend static files

The GitHub runner-to-server link is slow. The production files in
`frontend/public/` are therefore stored persistently at
`/home/ubuntu/moonbot-static/frontend-public/` and omitted from routine source
archives. The large `frontend/assets/` directory contains README/demo media,
is not used by the production application, and is also omitted.

Initialize or update the persistent public directory from the repository root.
Install `sshpass` first, then provide the password through the environment so it
is not written into the repository:

```bash
COPYFILE_DISABLE=1 tar -C frontend/public \
  -czf /tmp/moonbot-frontend-public.tar.gz .

read -s SSHPASS && export SSHPASS
sshpass -e scp \
  -o StrictHostKeyChecking=no \
  -o ConnectTimeout=20 \
  /tmp/moonbot-frontend-public.tar.gz \
  ubuntu@82.157.189.119:/home/ubuntu/

sshpass -e ssh \
  -o StrictHostKeyChecking=no \
  -o ConnectTimeout=20 \
  ubuntu@82.157.189.119 \
  'set -e
   cd /home/ubuntu
   rm -rf moonbot-static/frontend-public.new
   mkdir -p moonbot-static/frontend-public.new
   tar xzf moonbot-frontend-public.tar.gz \
     -C moonbot-static/frontend-public.new
   test -n "$(find moonbot-static/frontend-public.new \
     -type f -print -quit)"
   rm -rf moonbot-static/frontend-public.old
   if [ -d moonbot-static/frontend-public ]; then
     mv moonbot-static/frontend-public \
       moonbot-static/frontend-public.old
   fi
   mv moonbot-static/frontend-public.new \
     moonbot-static/frontend-public
   find moonbot-static/frontend-public -type f | wc -l
   du -sh moonbot-static/frontend-public'

unset SSHPASS
```

Run this synchronization whenever committed files below `frontend/public/`
change. Routine code-only deployments do not need it.

If the persistent directory is absent or empty, CI intentionally stops before
the Docker builds and prints the initialization instruction. Deployment logs
also print all archive sizes and unbuffered Docker build progress. The deploy
job times out after 60 minutes instead of waiting indefinitely.

### Verify production

```bash
curl -f http://82.157.189.119:8089/
curl -f http://82.157.189.119:8088/health
ssh ubuntu@82.157.189.119 'docker ps --filter name=moonbot'
```

When a deploy appears stuck before Docker output, inspect the SCP/SFTP process
and partially uploaded archives:

```bash
ssh ubuntu@82.157.189.119 \
  "ps -ef | grep '[s]ftp-server'; ls -lh ~/*-deploy.tar"
```

Password authentication is retained for the current workflow. Prefer SSH keys
for a future deployment hardening change.
