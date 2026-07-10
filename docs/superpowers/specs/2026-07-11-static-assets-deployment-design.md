# Static Assets Deployment Design

## Goal

Avoid repeatedly transferring large frontend static assets over the slow GitHub Actions-to-China SSH link while keeping production builds reproducible and failures understandable.

## Scope

- Persist `frontend/public/` once on the deployment server.
- Exclude `frontend/public/` from routine CI deployment archives.
- Exclude `frontend/assets/` because it contains README/demo media and is not referenced by the production application.
- Restore `public/` into the frontend Docker build context on the server.
- Document initial setup, static-asset updates, routine deployment, and troubleshooting.

Application code, backend deployment, code2video deployment, domains, TLS, and container-registry deployment are outside this change.

## Architecture

The deployment server owns a persistent static-resource directory at:

```text
/home/ubuntu/moonbot-static/frontend-public/
```

The directory is initialized out of band with `sshpass`/`scp`. Routine GitHub Actions runs package frontend source without `public/` or `assets/`. After extracting the source archive, the remote deployment script validates the persistent directory and copies it to:

```text
/home/ubuntu/moonbot-frontend-src/public/
```

The existing frontend Dockerfile then copies that restored directory into the runtime image. The persistent directory is outside `moonbot-frontend-src`, so deleting and recreating the build context does not remove it.

## Deployment Flow

### Initial static-resource setup

1. Create a compressed archive from `frontend/public/` locally.
2. Upload it to the server using the existing SSH credentials.
3. Extract it into `/home/ubuntu/moonbot-static/frontend-public/`.
4. Verify representative files and total size on the server.

### Routine GitHub Actions deployment

1. Build and test backend and frontend on the GitHub-hosted runner.
2. Package backend and code2video as before.
3. Package frontend while excluding `node_modules`, `.next`, `.git`, tests, `.pnpm-store`, `assets`, and `public`.
4. Print archive sizes before transfer.
5. Transfer the three smaller source archives over SCP.
6. Recreate the remote source directories.
7. Validate `/home/ubuntu/moonbot-static/frontend-public/` contains files.
8. Copy it into `moonbot-frontend-src/public/`.
9. Build images with plain Docker progress and labeled log groups.
10. Replace containers and print their final status.

### Static-resource update

Whenever a committed file under `frontend/public/` changes, an operator reruns the documented static-resource upload procedure before or together with the code deployment. The upload replaces the persistent directory atomically enough for this single-server workflow: extract to a temporary directory, validate it, then swap directories.

## Error Handling and Observability

- The deploy job has an explicit timeout so a stalled transfer cannot occupy a runner indefinitely.
- Archive sizes are printed before SCP, making unexpected package growth visible.
- Remote build stages print clear labels and use `docker build --progress=plain`.
- Deployment fails before Docker build when the persistent static directory is absent or empty.
- Existing production containers are stopped only after all three images build successfully, preserving the current service during transfer or build failures.

## Validation

- Confirm the pre-uploaded server directory is non-empty and matches the local `frontend/public/` archive size/file count.
- Create the revised frontend deployment archive locally and confirm it contains neither `assets/` nor `public/`.
- Validate the workflow YAML syntax and inspect the remote shell script with `bash -n` after extracting it for testing where practical.
- Run the existing backend and frontend test/build commands.
- After deployment, verify frontend HTTP 200, backend health HTTP 200, and container status.

## Security

The existing password-based deployment remains in scope for this change, but documentation must avoid embedding the password. Commands accept it through `SSHPASS` or an interactive prompt. Migrating GitHub Actions to SSH keys is recommended separately.
