#!/usr/bin/env bash
# Run this once on a fresh Ubuntu 22.04/24.04 EC2 t2.micro/t3.micro instance
# (free-tier eligible). Sets up: swap, k3s (lightweight Kubernetes), git,
# Jenkins, and kubectl.
#
# Deliberately NOT installed: Docker. Docker images are built in GitHub
# Actions (.github/workflows/build-and-push.yml), not on this box — an
# 8GB disk doesn't have room for Docker builds on top of k3s + Jenkins.
# k3s has its own built-in container runtime (containerd) and doesn't need
# the Docker daemon at all; Jenkins here only runs `kubectl` commands.
#
# Usage: sudo bash ec2-setup.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this as root (sudo bash ec2-setup.sh)." >&2
  exit 1
fi

echo "== 0/5: Clearing any stale Jenkins repo config from a previous failed run =="
# If a prior run died partway through adding the Jenkins repo, a broken
# /etc/apt/sources.list.d/jenkins.list can block *every* future apt-get
# update (including step 1 below) with a GPG verification error, even
# after this script is fixed. Always clear it before touching apt.
rm -f /etc/apt/sources.list.d/jenkins.list /usr/share/keyrings/jenkins-keyring.asc

echo "== 1/5: System update =="
apt-get update -y
apt-get upgrade -y

echo "== 2/5: Swap file (2GB) =="
# A t2/t3.micro has 1GB RAM. Running k3s + Jenkins + app pods on that
# without swap risks the OOM killer taking down whichever process is
# biggest at the worst moment. This doesn't fix the RAM shortage, it just
# turns hard crashes into (very) slow disk-backed memory.
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap file created and enabled."
else
  echo "Swap file already exists, skipping."
fi

echo "== 3/5: k3s (lightweight Kubernetes) =="
if ! command -v k3s &>/dev/null; then
  curl -sfL https://get.k3s.io | sh -
  # Wait for the node to report Ready before moving on.
  echo "Waiting for k3s node to become Ready..."
  for _ in $(seq 1 30); do
    if k3s kubectl get nodes 2>/dev/null | grep -q ' Ready'; then
      break
    fi
    sleep 5
  done
  k3s kubectl get nodes
else
  echo "k3s already installed, skipping."
fi

echo "== 4/5: git + Jenkins =="
if ! command -v git &>/dev/null; then
  apt-get install -y git
fi

if ! command -v jenkins &>/dev/null && [[ ! -d /var/lib/jenkins ]]; then
  apt-get install -y fontconfig openjdk-21-jre
  curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key \
    -o /usr/share/keyrings/jenkins-keyring.asc
  echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" \
    > /etc/apt/sources.list.d/jenkins.list
  apt-get update -y
  apt-get install -y jenkins

  # Constrain Jenkins' JVM heap so it doesn't crowd out k3s and the app
  # pods on a 1GB-RAM box. Adjust JENKINS_JAVA_OPTIONS if builds OOM.
  mkdir -p /etc/systemd/system/jenkins.service.d
  cat > /etc/systemd/system/jenkins.service.d/override.conf << 'EOF'
[Service]
Environment="JAVA_OPTS=-Xmx384m"
EOF
  systemctl daemon-reload
  systemctl enable --now jenkins
else
  echo "Jenkins already installed, skipping."
fi

echo "== 5/5: kubectl + wiring Jenkins to the cluster =="
if ! command -v kubectl &>/dev/null; then
  curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
  install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
  rm -f kubectl
fi

mkdir -p /var/lib/jenkins/.kube
cp /etc/rancher/k3s/k3s.yaml /var/lib/jenkins/.kube/config
chown -R jenkins:jenkins /var/lib/jenkins/.kube
chmod 600 /var/lib/jenkins/.kube/config

systemctl restart jenkins

echo ""
echo "=================================================================="
echo "Done. Next steps:"
echo "1. Jenkins initial admin password:"
echo "   cat /var/lib/jenkins/secrets/initialAdminPassword"
echo "2. Open Jenkins at http://<this-instance-public-ip>:8080"
echo "   (restrict inbound 8080 in your Security Group to your own IP only)"
echo "3. Push this repo to GitHub. In the repo's Settings > Secrets and"
echo "   variables > Actions, add DOCKERHUB_USERNAME and DOCKERHUB_TOKEN"
echo "   (a Docker Hub access token, not your password) — the"
echo "   build-and-push workflow needs these, Jenkins does not."
echo "4. Replace REPLACE_DOCKERHUB_USERNAME in Jenkinsfile and both"
echo "   k8s/*-deployment.yaml files with your actual Docker Hub username."
echo "5. Create the k8s app-secrets Secret (see k8s/secret.example.yaml)"
echo "   before the pipeline's Deploy stage runs, or the server pod will"
echo "   crash-loop with 'Missing JWT_SECRET'."
echo "6. Create a Jenkins Pipeline job pointing at this repo's Jenkinsfile."
echo "   Configure its trigger as 'Poll SCM' (e.g. schedule 'H/5 * * * *'),"
echo "   not a webhook — no inbound port needed for GitHub to reach this box."
echo "=================================================================="
