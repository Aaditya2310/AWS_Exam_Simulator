// Deploy-only pipeline. Building and pushing images happens in GitHub
// Actions (.github/workflows/build-and-push.yml) — NOT here — because this
// box doesn't have disk space to spare for Docker builds on top of k3s +
// Jenkins. Jenkins no longer needs Docker installed at all.
//
// Trigger: configure this job with "Poll SCM" (e.g. schedule "H/5 * * * *"
// — every ~5 minutes) rather than a webhook, so the EC2 box doesn't need
// an inbound port opened for GitHub to reach it.
//
// Requires:
//   - Jenkins user has a working kubeconfig at ~/.kube/config (set up by
//     scripts/ec2-setup.sh)
//   - git installed on the Jenkins host (also handled by ec2-setup.sh)
//   - DOCKERHUB_USERNAME below matches the account GitHub Actions pushes to
pipeline {
    agent any

    environment {
        DOCKERHUB_USERNAME = 'REPLACE_DOCKERHUB_USERNAME'
    }

    options {
        timeout(time: 15, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.IMAGE_TAG = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                }
                echo "Deploying commit ${env.IMAGE_TAG}"
            }
        }

        stage('Wait for images to exist on Docker Hub') {
            steps {
                script {
                    ['aws-exam-server', 'aws-exam-client'].each { repo ->
                        def url = "https://hub.docker.com/v2/repositories/${DOCKERHUB_USERNAME}/${repo}/tags/${env.IMAGE_TAG}"
                        def found = false
                        // GitHub Actions may still be mid-build when this
                        // job polls in on the same commit. Retry rather
                        // than fail immediately — up to ~5 minutes.
                        for (int i = 0; i < 20; i++) {
                            def status = sh(script: "curl -s -o /dev/null -w '%{http_code}' '${url}'", returnStdout: true).trim()
                            if (status == '200') {
                                found = true
                                break
                            }
                            echo "Image ${repo}:${env.IMAGE_TAG} not on Docker Hub yet (attempt ${i + 1}/20), waiting 15s..."
                            sleep(time: 15, unit: 'SECONDS')
                        }
                        if (!found) {
                            error "Timed out waiting for ${DOCKERHUB_USERNAME}/${repo}:${env.IMAGE_TAG} to appear on Docker Hub. Check the GitHub Actions run for this commit."
                        }
                    }
                }
            }
        }

        stage('Deploy: apply manifests') {
            steps {
                sh '''
                    kubectl apply -f k8s/namespace.yaml
                    kubectl apply -f k8s/server-pvc.yaml
                    kubectl apply -f k8s/server-deployment.yaml
                    kubectl apply -f k8s/client-deployment.yaml
                    kubectl apply -f k8s/ingress.yaml
                '''
                // k8s/secret.example.yaml is intentionally NOT applied here —
                // the real app-secrets Secret is created once, by hand, per
                // that file's instructions. Jenkins never sees JWT_SECRET.
                sh """
                    kubectl -n aws-exam set image deployment/server server=${DOCKERHUB_USERNAME}/aws-exam-server:${IMAGE_TAG}
                    kubectl -n aws-exam set image deployment/client client=${DOCKERHUB_USERNAME}/aws-exam-client:${IMAGE_TAG}
                """
            }
        }

        stage('Deploy: verify rollout') {
            steps {
                sh '''
                    kubectl -n aws-exam rollout status deployment/server --timeout=120s
                    kubectl -n aws-exam rollout status deployment/client --timeout=120s
                '''
            }
        }
    }

    post {
        failure {
            echo "Pipeline failed. Deployments were NOT rolled back automatically — check 'kubectl -n aws-exam rollout status' and roll back manually with 'kubectl -n aws-exam rollout undo deployment/<name>' if needed."
        }
    }
}
