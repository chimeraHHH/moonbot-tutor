# moonbot-tutor

AI-driven teaching tool: an OpenMAIC classroom frontend that turns a
question/topic into a narrated **Manim explainer video** through a NestJS BFF.

The frontend is ported from [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)
and its `real-time-tutor` fork. Deep Solve video requests use the API contract
in `openapi.yaml` and flow through the NestJS backend to code2video.

## Architecture

```
OpenMAIC frontend
        │  REST (openapi.yaml)
        ▼
┌───────────────────────┐        ┌──────────────────────────────┐
│  backend/  (NestJS,TS)│ ─────► │  services/code2video (FastAPI)│
│  BFF / forwarding     │  HTTP  │  7-stage Manim pipeline       │
└───────────────────────┘        └──────────────────────────────┘
```

- **`frontend/`** — Next.js/OpenMAIC classroom UI (pnpm workspace).
- **`backend/`** — NestJS (TypeScript + Vitest + npm). Thin BFF that implements
  the `openapi.yaml` contract and forwards to the FastAPI service.
- **`services/code2video/`** — FastAPI "Deep Solve" pipeline
  (`llm1 → llm2 → storyboard → audio → code → render → merge`).
- **LLM**: Claude via `byteswarm.ai` relay. **TTS**: Doubao. **Manim**: ManimCE.

## Layout

```
backend/                 NestJS BFF (TS + Vitest + npm)
frontend/                Next.js/OpenMAIC classroom (pnpm)
services/code2video/     FastAPI Manim service
openapi.yaml             the API contract
docker-compose.yml       orchestration
.github/workflows/       CI/CD (build → test → SCP → remote Docker build)
```

## Develop (backend)

```bash
cd backend
npm install
npm run start:dev   # http://localhost:3000
npm test
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
