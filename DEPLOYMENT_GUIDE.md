# StockPile — Deployment Guide

A step-by-step walkthrough from laptop to a monitored EKS cluster, in the order you should do it.

- **📸 SS-xx** marks a screenshot to take. Save it as `demo/screenshots/SS-xx-<name>.png`.
- **🎥** marks something to show in the video.
- **💸** marks a step that starts costing money on AWS.

The full screenshot checklist, mapped to the rubric, is at the end ([§12](#12-screenshot-checklist-rubric-mapping)).

---

## 0. Before you start

> **Shell:** every command here is bash/zsh syntax. If your terminal opens **fish**, type `zsh` (or `bash`) first. Fish doesn't understand `VAR=value` or `$(...)` used this way.

### Tools

| Tool | Check | Install (macOS) |
|------|-------|-----------------|
| Docker Desktop | `docker info` | docker.com |
| Node.js 22+ | `node -v` | `brew install node@22` |
| Git + GitHub CLI | `gh --version` | `brew install gh` |
| Terraform ≥ 1.7 | `terraform -v` | `brew install terraform` |
| AWS CLI v2 | `aws --version` | `brew install awscli` |
| kubectl | `kubectl version --client` | `brew install kubectl` |
| Helm | `helm version` | `brew install helm` |

### AWS account

docker compose up -d postgresgit push -u origin analytics
1. Use an **IAM user/role with AdministratorAccess**, not the root user.
2. `aws configure` → enter the access key, secret, region `ap-south-1`, output `json`.
3. `aws sts get-caller-identity` should print your account. **Never put these keys in any file in the repo.**

### 💸 Cost and time budget

The EKS phase runs about **US $0.35–0.45 per hour**: EKS control plane $0.10, 2 × t3.large, NAT gateway, load balancer and EBS. Plan **one sitting of 4–6 hours** for phases 4–10, record the video in that same sitting, then **destroy everything** (phase 11). Leaving it up overnight costs roughly $10.

### Replace the placeholders

These steps assume your GitHub repo is named **`stockpile`**. From the project root, swap in your GitHub username (lowercase):

```bash
GH_USER=shaikh-suja-rahaman     # lowercase!
grep -rl YOUR_GITHUB_USERNAME helm argocd troubleshooting | xargs sed -i '' "s/YOUR_GITHUB_USERNAME/$GH_USER/g"
grep -rn "$GH_USER" helm argocd troubleshooting    # verify
```

(On Linux, use `sed -i` without the `''`.)

---

## 1. Run it locally

### 1.1 Tests

```bash
cd backend
npm ci
npx jest --verbose
cd ..
```

**📸 SS-01 — `npx jest --verbose` showing all 24 tests passing** (M2)

### 1.2 Full stack with Docker Compose

```bash
docker compose up --build
```

Leave it running and wait for `stockpile-backend listening on :4000`.

**📸 SS-02 — terminal showing `docker compose up --build` running: the three containers started, migrations applied** (M4)

Open http://localhost:3000. Add an item, use **+ / −** on stock, edit one, delete one, try the search and the **Low stock only** filter.

**📸 SS-03 — the StockPile UI at `localhost:3000` with data** (M1, M4)

In a second terminal:

```bash
curl -s localhost:4000/health
curl -s localhost:4000/api/items | head -c 300; echo
curl -s localhost:4000/metrics | grep -E "^http_requests_total|^stockpile_"
docker compose exec postgres psql -U stockpile -c "select id, name, sku, quantity from items;"
```

**📸 SS-04 — the curl outputs plus the `psql` query of the `items` table** (M1: API + database)

Optional: `docker compose exec backend id` shows `uid=1000(node)`, i.e. non-root.

Stop the stack with `docker compose down`.

---

## 2. GitHub repository and commit history

The rubric wants **at least 10 meaningful commits**. Commit in logical chunks rather than one giant "initial commit".

```bash
gh auth login                              # once
git init -b main

git add .gitignore && git commit -m "chore: add gitignore for node, terraform and secrets"
git add backend/package.json backend/package-lock.json backend/knexfile.js backend/src/config.js backend/src/db.js backend/.env.example \
  && git commit -m "feat(backend): scaffold Express API with Knex PostgreSQL connection"
git add backend/migrations backend/seeds && git commit -m "feat(db): add items table migration and idempotent sample seed"
git add backend/src && git commit -m "feat(api): add inventory CRUD, stock adjustment, stats, health and metrics endpoints"
git add backend/tests && git commit -m "test(api): cover items endpoints, validation and readiness with Jest + pg-mem"
git add frontend && git commit -m "feat(frontend): add React inventory dashboard with KPI cards, filters and item modal"
git add backend/Dockerfile backend/.dockerignore docker-compose.yml \
  && git commit -m "build: containerize services as non-root and add docker compose stack"
git add .github && git commit -m "ci: add GitHub Actions pipeline with tests, Trivy scan and GHCR push"
git add terraform && git commit -m "infra: provision VPC and EKS with EBS CSI driver using Terraform"
git add k8s helm && git commit -m "deploy: add namespace, gp3 storage class and StockPile Helm chart"
git add monitoring && git commit -m "observability: add kube-prometheus-stack values and Grafana dashboard"
git add argocd && git commit -m "gitops: add ArgoCD application for automated sync"
git add troubleshooting scripts && git commit -m "ops: add troubleshooting lab manifests and HPA load test script"
git add README.md DEPLOYMENT_GUIDE.md demo && git commit -m "docs: add project README, deployment guide and demo folder"
git status    # should be clean

gh repo create stockpile --public --source=. --remote=origin   # public: ArgoCD and graders need read access
```

> Don't push yet. Section 3 starts with the push, so you can watch the first pipeline run.

**📸 SS-05 — later, once the CI bot commits are also there: `git log --oneline` or GitHub's Commits page showing ≥ 10 commits** (M3)

---

## 3. CI/CD pipeline and GHCR

### 3.1 Trigger the pipeline

```bash
git push -u origin main
gh run watch          # or open the Actions tab in the browser
```

The run shows **Test · Backend → Build · Frontend → Validate · Terraform + Helm → Image · backend / Image · frontend → Deploy · bump image tag**.

**📸 SS-06 — Actions run summary page: the whole graph green** (M5)
**📸 SS-07 — open the `Test · Backend (Jest)` job → expanded "Run tests" step showing the passing tests** (M5: pytest-equivalent gate)
**📸 SS-08 — open `Image · backend` → expanded "Trivy scan" step showing the report table (0 HIGH/CRITICAL). Take the same for `Image · frontend`.** (M6)

Copy the run URL for the submission form.

### 3.2 Make the images public

GHCR packages start out **private**, and your cluster would get `ImagePullBackOff`.

1. Go to `https://github.com/<you>?tab=packages`.
2. For each of `stockpile-backend` and `stockpile-frontend`, open **Package settings → Change visibility → Public**.

**📸 SS-09 — a GHCR package page showing the image tag = the full commit SHA** (M5)

### 3.3 Pull the bot's commit

The last job committed the new image tag into `helm/stockpile/values-prod.yaml`:

```bash
git pull
grep -A3 "image:" helm/stockpile/values-prod.yaml    # tag: <40-char sha>
```

### 3.4 (Optional but great for M6) Prove the gate works

To show Trivy blocking a vulnerable image, temporarily change `frontend/Dockerfile` to `FROM nginxinc/nginx-unprivileged:1.28-alpine` and remove the `apk upgrade` line, push to a branch and open a PR. The scan fails on nginx/pcre2/zlib CVEs. Screenshot it, then close the PR.

**📸 SS-10 (optional) — failed Trivy step listing CVEs**

> **M6 written explanation (2–3 sentences, adapt this):** Trivy scanned the OS packages (Alpine apk) and the application libraries (npm `node_modules`) inside both images against public vulnerability databases, and the pipeline fails if any HIGH or CRITICAL CVE with an available fix is found. Our final images scan clean. Getting there meant upgrading the frontend base from nginx 1.28 to 1.30 and running `apk upgrade` at build time, because the older base shipped vulnerable nginx, pcre2 and zlib versions. We also pinned trivy-action 0.35.0 / Trivy v0.69.3, because earlier tags were hijacked in the March 2026 Trivy supply-chain attack (CVE-2026-33634).

---

## 4. 💸 Terraform: create VPC + EKS

```bash
cd terraform
terraform init
terraform fmt -check && terraform validate
terraform plan -out tfplan
```

**📸 SS-11 — end of `terraform plan`: "Plan: NN to add, 0 to change, 0 to destroy"** (M7)

```bash
terraform apply tfplan          # ~15–20 minutes
```

**📸 SS-12 — `Apply complete!` with the outputs (cluster_name, vpc_id, configure_kubectl)** (M7)

Connect kubectl:

```bash
eval "$(terraform output -raw configure_kubectl)"
kubectl get nodes -o wide       # 2 nodes, STATUS Ready
cd ..
```

In the AWS Console (region **Mumbai / ap-south-1**):

**📸 SS-13 — VPC → Your VPCs: `stockpile-vpc`, plus the Subnets list showing 2 public + 2 private** (M7)
**📸 SS-14 — EKS → Clusters → `stockpile-eks`: status Active, version 1.34. Also the Compute tab with the node group** (M7)

🎥 In the video, show `terraform plan` output and these two console pages.

---

## 5. Bootstrap the cluster (one time)

Run these in order. Each one is a prerequisite for the next.

```bash
# 5.1 Namespace (Pod Security "restricted") + default encrypted gp3 StorageClass
kubectl apply -f k8s/namespace.yaml -f k8s/storageclass-gp3.yaml

# 5.2 Helm repositories
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 5.3 Ingress controller -> creates an AWS load balancer (💸)
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace

# 5.4 metrics-server (the HPA needs CPU metrics)
helm upgrade --install metrics-server metrics-server/metrics-server -n kube-system

# 5.5 Prometheus + Grafana. Must be installed BEFORE the app, because it provides the ServiceMonitor CRD.
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f monitoring/kube-prometheus-stack-values.yaml
kubectl apply -f monitoring/grafana-dashboard.yaml

# 5.6 Wait until everything is up
kubectl get pods -A
kubectl get svc -n ingress-nginx ingress-nginx-controller   # EXTERNAL-IP = xxxx.elb.ap-south-1.amazonaws.com
```

The load balancer hostname can take 2–3 minutes to start resolving.

---

## 6. Deploy with Helm (manual, for the M8 screenshots)

```bash
helm upgrade --install stockpile ./helm/stockpile \
  -n stockpile \
  -f helm/stockpile/values-prod.yaml \
  --wait --timeout 5m

kubectl get pods -n stockpile -o wide
```

Wait until every pod is `Running` and `READY 1/1`: 2 backend, 2 frontend, 1 postgres.

**📸 SS-15 — `kubectl get pods -n stockpile`, all Running** (M8)
**📸 SS-16 — `kubectl get svc -n stockpile`, ClusterIP services for backend, frontend and postgres** (M8)
**📸 SS-17 — `helm list -n stockpile`, status deployed** (M8)
**📸 SS-18 — `kubectl get ingress -n stockpile`, ADDRESS = ELB hostname** (M8)

Open the app through the Ingress:

```bash
LB=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "http://$LB"
curl -s "http://$LB/api/items/stats"
```

**📸 SS-19 — the browser at `http://<elb-hostname>` showing StockPile (address bar visible)** (M8)

The metrics endpoint is internal-only, so port-forward to it:

```bash
kubectl port-forward -n stockpile svc/stockpile-backend 4000:4000 &
curl -s localhost:4000/metrics | head -40
```

**📸 SS-20 — `curl …/metrics` output** (M9)

### Troubleshooting this step

| Symptom | Fix |
|---------|-----|
| `ImagePullBackOff` | The GHCR packages are still private (§3.2), or the tag in values-prod.yaml is wrong (`git pull`) |
| postgres pod `Pending` | `kubectl describe pvc -n stockpile`. Check that the gp3 StorageClass exists and the EBS CSI add-on is Active in the EKS console |
| backend stuck in `Init:0/1` | postgres isn't Ready yet; `kubectl logs -n stockpile stockpile-postgres-0` |
| `no matches for kind ServiceMonitor` | kube-prometheus-stack is not installed (§5.5) |
| ingress ADDRESS empty | `kubectl get pods -n ingress-nginx`; the ELB can take a few minutes |

---

## 7. HPA: autoscaling demo

Terminal A:

```bash
kubectl get hpa -n stockpile -w
```

Terminal B:

```bash
./scripts/load-test.sh 240 30     # 4 minutes, 30 parallel workers, run from inside the cluster
```

Within 1–2 minutes the TARGETS column climbs above 60%, and REPLICAS goes from 2 to 3, 4 and higher. After the load stops it scales back down (after about 60s of stabilization).

**📸 SS-21 — `kubectl get hpa -n stockpile` showing CPU above target and REPLICAS > 2**
**📸 SS-22 — `kubectl get pods -n stockpile` showing the extra backend pods**

If the TARGETS column shows `<unknown>`, metrics-server isn't ready yet: `kubectl top pods -n stockpile` must work first. If CPU doesn't climb, increase the workers: `./scripts/load-test.sh 240 60`.

Keep this traffic in mind: it is what makes the Grafana panels interesting in the next step. Run the load test again while you take the Grafana screenshot.

---

## 8. Prometheus and Grafana

### Prometheus

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
```

Open http://localhost:9090 → **Status → Targets** (Prometheus 3: **Status → Target health**). Search for `stockpile`. The pool `serviceMonitor/stockpile/stockpile-backend/0` shows every backend pod as **UP**.

**📸 SS-23 — Prometheus Targets page with stockpile-backend UP** (M9)

Optionally, run the query `sum by (route) (rate(http_requests_total[1m]))` on the Query page.

### Grafana

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3001:80
```

Open http://localhost:3001 and log in as `admin` / `admin` (the password set in the monitoring values). Go to **Dashboards → StockPile API**. Generate some traffic, either by clicking around the app or with `./scripts/load-test.sh 120 20`.

**📸 SS-24 — the StockPile API dashboard with populated panels (req/s, latency, routes, pods)** (M9)
**📸 SS-25 (bonus) — the built-in dashboard "Kubernetes / Compute Resources / Namespace (Pods)" for namespace stockpile**

---

## 9. ArgoCD: switch to GitOps

You have your Helm screenshots. Now hand the app over to ArgoCD, so that from here on a `git push` deploys.

### 9.1 Install ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd --server-side -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait -n argocd --for=condition=available deploy --all --timeout=5m

# admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo

kubectl port-forward -n argocd svc/argocd-server 8443:443
```

Open https://localhost:8443 (accept the self-signed certificate) and log in as `admin` with the password printed above.

### 9.2 Hand over from Helm to ArgoCD

Remove the manual Helm release so the app has exactly one owner. The PostgreSQL volume (PVC) is **not** deleted by `helm uninstall`, so your data survives.

```bash
helm uninstall stockpile -n stockpile
kubectl apply -f argocd/application.yaml
```

Within a minute, ArgoCD shows the `stockpile` app as **Synced / Healthy**, and the pods are back.

**📸 SS-26 — ArgoCD application tree: Synced + Healthy** 🎥

### 9.3 The GitOps demo, which is the core of the video

1. Make a visible change, for example in `frontend/src/App.jsx` change `<p>Inventory at a glance</p>` to `<p>Inventory at a glance · v2</p>`.
2. Commit and push:
   ```bash
   git commit -am "feat(frontend): show release label in header"
   git push
   ```
3. 🎥 Show the GitHub Actions run going green end to end.
4. 🎥 Show the bot commit `deploy: stockpile <sha> [skip ci]` that changes `values-prod.yaml`.
5. 🎥 In ArgoCD, click **Refresh** (or wait up to 3 minutes). It detects the new revision and syncs, and the frontend pods roll.
6. 🎥 Reload `http://<elb-hostname>`: "v2" appears.
7. Optionally, demo self-heal: `kubectl scale deploy stockpile-frontend -n stockpile --replicas=5` and watch ArgoCD put it back to 2.

**📸 SS-27 — ArgoCD app details showing the new commit SHA as the synced revision**

Run `git pull` afterwards to fetch the bot's commit.

---

## 10. Troubleshooting lab (for the video / live demo)

```bash
# Lab 1 — broken image
kubectl apply -f troubleshooting/broken-image.yaml
kubectl get pods -n stockpile -l app=broken-image          # ImagePullBackOff
kubectl describe pod -n stockpile -l app=broken-image | tail -15
kubectl get events -n stockpile --sort-by=.lastTimestamp | tail -5
kubectl delete -f troubleshooting/broken-image.yaml

# Lab 2 — Service selects no pods
kubectl apply -f troubleshooting/broken-service.yaml
kubectl get endpointslices -n stockpile -l kubernetes.io/service-name=broken-service   # no endpoints
kubectl get pods -n stockpile --show-labels | grep component
kubectl delete -f troubleshooting/broken-service.yaml

# Lab 3 — bad readiness probe (set a real image tag in the file first)
kubectl apply -f troubleshooting/broken-readiness.yaml
kubectl get pods -n stockpile -l app=broken-readiness      # Running, 0/1 READY
kubectl describe pod -n stockpile -l app=broken-readiness | grep -i readiness
kubectl delete -f troubleshooting/broken-readiness.yaml
```

**📸 SS-28 — `describe pod` output showing the ImagePullBackOff reason** (optional)

---

## 11. 💸 Tear everything down, the same day

The **order matters**. Load balancers and EBS volumes created by Kubernetes are not tracked by Terraform. If you destroy first, they block VPC deletion or keep billing you.

```bash
# 1. Stop ArgoCD from recreating things, then delete the app namespace (PVC -> EBS volume deleted)
kubectl delete -f argocd/application.yaml
kubectl delete namespace stockpile

# 2. Remove the ingress controller -> deletes the AWS load balancer
helm uninstall ingress-nginx -n ingress-nginx
kubectl delete namespace ingress-nginx

# 3. Wait until the load balancer is really gone (should print nothing)
aws elb describe-load-balancers --region ap-south-1 --query 'LoadBalancerDescriptions[].DNSName' --output text
aws elbv2 describe-load-balancers --region ap-south-1 --query 'LoadBalancers[].DNSName' --output text

# 4. Destroy the infrastructure (~10–15 min)
cd terraform
terraform destroy
```

**📸 SS-29 — `Destroy complete! Resources: NN destroyed.`** (M7)

Finally, check in the AWS Console (ap-south-1) that EKS, EC2 instances, Load Balancers, NAT Gateways, Elastic IPs and EBS Volumes are all empty.

---

## 12. Screenshot checklist (rubric mapping)

| # | Screenshot | Rubric |
|---|------------|--------|
| SS-01 | `npx jest --verbose` all passing | M2 |
| SS-02 | `docker compose up --build` running | M4 |
| SS-03 | UI at localhost:3000 | M1, M4 |
| SS-04 | curl API + `psql` items table | M1 |
| SS-05 | ≥ 10 commits | M3 |
| SS-06 | green Actions run | M5 |
| SS-07 | test step output in CI | M5 |
| SS-08 | Trivy scan output (both images) | M6 |
| SS-09 | GHCR package with SHA tag | M5 |
| SS-10 | *(optional)* Trivy blocking a vulnerable image | M6 |
| SS-11 | `terraform plan` | M7 |
| SS-12 | `terraform apply` complete | M7 |
| SS-13 | AWS Console VPC + subnets | M7 |
| SS-14 | AWS Console EKS cluster + node group | M7 |
| SS-15 | `kubectl get pods` all Running | M8 |
| SS-16 | `kubectl get svc` | M8 |
| SS-17 | `helm list` | M8 |
| SS-18 | `kubectl get ingress` | M8 |
| SS-19 | app via ELB / Ingress in browser | M8 |
| SS-20 | `curl /metrics` | M9 |
| SS-21/22 | HPA scaling + extra pods | HPA |
| SS-23 | Prometheus target UP | M9 |
| SS-24 | Grafana dashboard populated | M9 |
| SS-26/27 | ArgoCD Synced/Healthy + new revision | Video |
| SS-29 | `terraform destroy` complete | M7 |

---

## 13. Video recording plan (follows SUBMISSION.md order)

Record it **while the cluster is up**, right after §9. Aim for 12–20 minutes.

1. **Slides (3–4 min):** overview, tech stack, architecture diagram, CI/CD flow, infrastructure, K8s setup, observability, key learnings. That covers the 8 slides the rubric requires.
2. **Codebase (2 min):** the folder tree, `backend/src/routes/items.js`, the migration, the tests, both Dockerfiles, the Helm chart templates, `ci-cd.yml`.
3. **CI/CD (3 min):** make the §9.3 change, push, and walk through the jobs as they run, including the Trivy step and the GHCR package.
4. **Terraform (2 min):** `terraform plan` output (re-run `terraform plan`; it should say "No changes") and the AWS Console VPC + EKS pages.
5. **ArgoCD (2 min):** the bot commit, then ArgoCD syncing the new SHA and the app tree.
6. **Kubernetes (2 min):** `kubectl get pods,svc,ingress,hpa -n stockpile`, the app in the browser showing the new change, and optionally the HPA load test.
7. **Prometheus (1 min):** the Targets page with stockpile-backend UP.
8. **Grafana (1 min):** the StockPile API dashboard updating live (run the load test in the background).
9. *(Optional)* A 1-minute troubleshooting lab.

Save the recording as `demo/presentation.mp4` and the slides as `demo/slides.pdf` (or `.pptx`), then commit them. GitHub rejects files over 100 MB. If the video is bigger, compress it (`ffmpeg -i in.mov -vcodec libx264 -crf 28 demo/presentation.mp4`) or attach it to a GitHub Release.

Before submitting, `git log` should show no secrets, and `git status` should not list `terraform.tfstate` or any `.tfvars`.
