#!/usr/bin/env bash
# Run this once on a fresh Ubuntu 22.04/24.04 EC2 t2.micro/t3.micro instance
# (free-tier eligible). Sets up: swap, k3s (lightweight Kubernetes), and git.
#
# No Jenkins, no Docker on this box at all. GitHub Actions builds both
# images AND deploys them — it SSHs into this instance after a successful
# build and runs `sudo k3s kubectl` directly. See
# .github/workflows/build-and-push.yml.
#
# Use `sudo k3s kubectl ...` for all kubectl commands on this box, not a
# bare `kubectl` — k3s's installer creates /usr/local/bin/kubectl as a
# symlink to the k3s binary itself, which does NOT follow the normal
# $HOME/.kube/config lookup convention and will fail with a permission
# error reading /etc/rancher/k3s/k3s.yaml directly. This cost real
# debugging time before being figured out; don't reinstall a standalone
# kubectl to "fix" it, just always use `sudo k3s kubectl`.
#
# Usage: sudo bash ec2-setup.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this as root (sudo bash ec2-setup.sh)." >&2
  exit 1
fi

echo "== 1/3: System update =="
apt-get update -y
apt-get upgrade -y

echo "== 2/3: Swap file (2GB) =="
# A t2/t3.micro has 1GB RAM. Running k3s + app pods on that without swap
# risks the OOM killer taking down whichever process is biggest at the
# worst moment. This doesn't fix the RAM shortage, it just turns hard
# crashes into (very) slow disk-backed memory.
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

echo "== 3/3: k3s (lightweight Kubernetes) + git =="
if ! command -v k3s &>/dev/null; then
  curl -sfL https://get.k3s.io | sh -
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

if ! command -v git &>/dev/null; then
  apt-get install -y git
fi

echo ""
echo "=================================================================="
echo "Done. Next steps:"
echo "1. Clone this repo onto the instance (needed for the GitHub Actions"
echo "   deploy step, which does 'git fetch && git reset --hard' here):"
echo "   git clone <your-repo-url> ~/AWS_Exam_Simulator"
echo "2. Create the k8s namespace and JWT secret before the first deploy:"
echo "   sudo k3s kubectl apply -f ~/AWS_Exam_Simulator/k8s/namespace.yaml"
echo "   sudo k3s kubectl create secret generic app-secrets --namespace aws-exam \\"
echo "     --from-literal=JWT_SECRET=\"\$(openssl rand -hex 48)\""
echo "3. In your GitHub repo: Settings > Secrets and variables > Actions,"
echo "   add five repository secrets:"
echo "     DOCKERHUB_USERNAME   - your Docker Hub username"
echo "     DOCKERHUB_TOKEN      - a Docker Hub access token (not password)"
echo "     EC2_HOST             - this instance's IP (use an Elastic IP,"
echo "                            not the default one, which changes on restart)"
echo "     EC2_USER             - ubuntu"
echo "     EC2_SSH_KEY          - the full contents of your .pem private key file"
echo "4. Push to main. Check the Actions tab — it should build, push, then"
echo "   SSH in and deploy automatically."
echo "=================================================================="
