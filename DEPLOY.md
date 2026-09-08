# Deploying with k3s (Kubernetes) + Jenkins on free-tier AWS, builds on GitHub Actions

This is the "learn the DevOps stack" path, on one free-tier EC2 instance.
That instance runs **k3s and Jenkins only** — Docker image builds happen in
**GitHub Actions**, not on the box. This split exists because an 8GB EBS
volume genuinely doesn't have room for Docker builds on top of k3s +
Jenkins + a 2GB swap file; this was discovered the hard way (`apt-get`
running out of disk space mid-install) rather than planned from the start.
Real EKS costs ~$73/month for the control plane alone regardless of usage,
which is the reason this uses k3s instead. See the caveats at the bottom
before relying on this for anything that matters.

## The actual flow

```
git push  ->  GitHub Actions builds both images, pushes to Docker Hub
                                    |
          Jenkins (polling, not webhook) notices the new commit,
          waits for the matching image tag to exist on Docker Hub,
          then kubectl-deploys it to the local k3s cluster
```

Jenkins never runs `docker build` and never needs Docker installed. Its
only jobs are: notice a new commit, confirm GitHub Actions has finished
pushing the corresponding image, and tell k3s to use it.

## What's actually been verified vs. what hasn't

**Verified**, with real commands and real output:
- `docker compose` config and both Dockerfiles are structurally sound
  (multi-stage builds, non-root user with a pinned UID/GID matching the
  k8s `fsGroup`) - built and run successfully via Docker Compose
- The exact `client/nginx.conf` in this repo, pointed at a live backend,
  correctly serves the production build AND reverse-proxies `/api/*` -
  register, login, and a protected route all worked through one origin
- All YAML in `k8s/` and `.github/workflows/` parses correctly (the
  workflow file's `on:` key specifically - a common YAML 1.1 gotcha where
  bare `on` parses as the boolean `true`, not a string key - is quoted to
  avoid relying on GitHub's special-case handling of it)
- `scripts/ec2-setup.sh` passes `shellcheck` with zero warnings and `bash -n`
- k3s, Jenkins, and the Jenkins GPG key/Java version issues were caught and
  fixed against a **real EC2 instance** during actual setup, not just
  reviewed on paper

**NOT verified**, because this sandbox can't run Docker, GitHub Actions,
or expose a port to the internet:
- The GitHub Actions workflow actually executing end-to-end
- The Jenkinsfile's Docker Hub tag-polling logic against a real pipeline run
- A full commit-to-deployed-pod cycle

## Step 1 - Launch the EC2 instance

- AMI: Ubuntu Server 22.04 or 24.04 LTS
- Instance type: `t2.micro` or `t3.micro`
- Storage: default 8GB. This is tight (see caveats) but workable now that
  Docker isn't installed on the box.
- Security Group inbound rules:
  - 22 (SSH) - restrict to your IP
  - 80, 443 (app traffic via Ingress) - open to the world
  - 8080 (Jenkins UI) - **restrict to your IP**, never open to the world

## Step 2 - Run the setup script

```bash
scp -i your-key.pem scripts/ec2-setup.sh ubuntu@<instance-ip>:~
ssh -i your-key.pem ubuntu@<instance-ip>
sudo bash ec2-setup.sh
```

Installs and starts: k3s, git, Jenkins, kubectl, plus a 2GB swap file.
Prints next steps at the end, including where to find Jenkins' initial
admin password.

**If you're rerunning this on an instance where you previously installed
Docker by hand** (e.g. you started down the original all-in-one path before
switching to this build-off-box approach), remove it first to reclaim
space:
```bash
sudo apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
sudo apt-get autoremove -y
sudo rm -rf /var/lib/docker
```

## Step 3 - Set up GitHub Actions

1. Push this repo to GitHub if you haven't already.
2. Repo **Settings -> Secrets and variables -> Actions -> New repository secret**:
   - `DOCKERHUB_USERNAME` - your Docker Hub username
   - `DOCKERHUB_TOKEN` - a Docker Hub **access token** (hub.docker.com ->
     Account Settings -> Security -> New Access Token), not your account password
3. In `.github/workflows/build-and-push.yml`, the image names are already
   parameterized by that secret - nothing to edit there.
4. Push to `main`. Check the **Actions** tab - you should see the workflow
   run and, on success, both images on Docker Hub under your account.

## Step 4 - Configure Jenkins

1. Visit `http://<instance-ip>:8080`, unlock with the password from the
   setup script's output, install suggested plugins.
2. Jenkins does **not** need Docker Hub credentials this time - it only
   reads public tag-existence info from Docker Hub's API and runs `kubectl`.
3. **New Item -> Pipeline**, point it at this repo, script path `Jenkinsfile`.
4. In the job's configuration, under **Build Triggers**, check **Poll SCM**
   and set a schedule like `H/5 * * * *` (roughly every 5 minutes). This is
   used instead of a GitHub webhook specifically so the EC2 box doesn't
   need an inbound port opened for GitHub to reach it.

## Step 5 - Edit the placeholders, then let it run

In `Jenkinsfile`, `k8s/server-deployment.yaml`, and
`k8s/client-deployment.yaml`, replace `REPLACE_DOCKERHUB_USERNAME` with
your actual Docker Hub username. Commit and push - Jenkins' next poll
picks it up.

## Step 6 - Create the JWT secret on the cluster (before first deploy)

```bash
sudo k3s kubectl create secret generic app-secrets \
  --namespace aws-exam \
  --from-literal=JWT_SECRET="$(openssl rand -hex 48)"
```

Do this before the pipeline's first successful deploy, or the server pod
will crash-loop on missing `JWT_SECRET`. If the `aws-exam` namespace
doesn't exist yet, create it first:
`sudo k3s kubectl apply -f k8s/namespace.yaml`.

## Step 7 - Verify

```bash
sudo k3s kubectl -n aws-exam get pods
sudo k3s kubectl -n aws-exam get ingress
curl http://<instance-ip>/api/health
```

Open `http://<instance-ip>` in a browser.

## Caveats, stated plainly

- **Deploys lag behind pushes by up to ~5 minutes** (the polling interval),
  and by however long GitHub Actions takes to build - this is not a fast
  feedback loop. Trigger the job manually from Jenkins if you don't want
  to wait for the next poll.
- **The Docker Hub tag-existence check in Jenkinsfile is unauthenticated
  and hits a public API.** Fine for this project's public images; if you
  ever push private images, that check will need Docker Hub credentials
  too, and the check itself will need updating.
- **This will still be tight on RAM.** Removing Docker fixed the disk
  problem, not the 1GB RAM one - k3s + Jenkins + app pods concurrently is
  still genuinely constrained. The 2GB swap file is still doing real work.
- **This is not highly available.** One node, one instance. A reboot means
  downtime until pods reschedule.
- **No test suite gating anything.** The old Jenkinsfile's `node --check`
  is gone along with the build stage - GitHub Actions builds without
  running any tests either. A successful pipeline run means "the image
  built and got deployed," not "the app works correctly."
- **SQLite + single replica.** Don't scale `server` past 1 replica without
  switching database first.
- **Check which AWS Free Tier your account is actually on** before
  assuming timelines. Accounts created after mid-2025 get a **$200 credit
  valid for 6 months**, after which the account auto-closes if unused -
  materially different from the older 12-month free-hours model. Check
  Billing -> Free Tier / Credits in the AWS Console, not just the "Free
  tier eligible" badge in the launch wizard, which appears on multiple
  instance sizes under the newer model and doesn't by itself mean
  "unlimited free usage."
