# StockPile — Inventory Manager on Kubernetes

StockPile is a small inventory-management web app: track products, SKUs, stock levels, unit prices and reorder points, and see at a glance what needs restocking.

The app is deliberately simple. The point of the project is the **delivery platform around it**: tested code becomes security-scanned container images, which are deployed with Helm onto an AWS EKS cluster built by Terraform, kept in sync by ArgoCD, scaled by an HPA and observed with Prometheus + Grafana.

> Step-by-step deployment instructions (including when to take each screenshot) are in **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)**.

---

## 1. Architecture

```text
 Developer ──git push──▶ GitHub (main)
                            │
                            ▼
                     GitHub Actions
   ┌─────────────────────────────────────────────────────────┐
   │ 1. Quality gates   Jest tests · Vite build · npm audit  │
   │                    terraform fmt/validate · helm lint   │
   │ 2. Images          docker build (backend, frontend)     │
   │                    Trivy scan ── fail on HIGH/CRITICAL  │
   │                    push ghcr.io/<user>/stockpile-*:<sha>│
   │ 3. GitOps          bump image tag in values-prod.yaml   │
   └─────────────────────────────────────────────────────────┘
                            │ (commit)
                            ▼
   Terraform ──▶ AWS  VPC (2 public + 2 private subnets, NAT)
                   └─ EKS cluster + managed node group
                        │
                ArgoCD watches Git ──▶ Helm chart (helm/stockpile)
                        │
          ┌─────────────┴──────────────────────────┐
          │ namespace: stockpile                   │
          │                                        │
  Internet ─▶ ingress-nginx (AWS ELB)              │
          │      ├── /api ──▶ backend Service ──▶ Express pods (HPA 2–6)
          │      └── /    ──▶ frontend Service ─▶ nginx + React pods
          │                        backend ──▶ PostgreSQL StatefulSet (EBS gp3 PVC)
          └────────────────────────────────────────┘
                        │ /metrics (ServiceMonitor)
                        ▼
          Prometheus ──▶ Grafana dashboard "StockPile API"
```

### Request flow

1. The browser loads the React app from the **frontend** pods (nginx serving static files).
2. The app calls relative URLs such as `/api/items`. The **Ingress** routes `/api/*` to the backend Service and everything else to the frontend. (When the frontend is reached without the Ingress, its nginx proxies `/api/` to the backend itself, so it works the same either way.)
3. The **backend** (Express) validates the request and reads or writes PostgreSQL through Knex.
4. Every request is recorded in Prometheus metrics, which are scraped from `/metrics`.

---

## 2. Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 7, plain responsive CSS, nginx (unprivileged) |
| Backend | Node.js 22, Express 5, Knex (query builder + migrations), helmet |
| Database | PostgreSQL 16 |
| Tests | Jest 30 + Supertest, with an in-memory PostgreSQL (pg-mem) |
| Metrics | prom-client (`/metrics`) |
| Containers | Docker multi-stage builds, Docker Compose |
| CI/CD | GitHub Actions |
| Security | Trivy image scanning, npm audit, non-root containers, read-only root FS, Pod Security "restricted", NetworkPolicy |
| Registry | GitHub Container Registry (GHCR) |
| IaC | Terraform (terraform-aws-modules VPC + EKS) |
| Platform | AWS EKS (Kubernetes 1.34), EBS CSI driver |
| Packaging / delivery | Helm 3/4, ArgoCD (GitOps) |
| Traffic | ingress-nginx |
| Autoscaling | HorizontalPodAutoscaler + metrics-server |
| Observability | kube-prometheus-stack (Prometheus Operator, Prometheus, Grafana) |

---

## 3. Repository structure

```text
stockpile/
├── backend/                    Express API
│   ├── src/
│   │   ├── app.js              Express app: health, readiness, metrics, routes
│   │   ├── routes/items.js     REST endpoints + validation
│   │   ├── metrics.js          Prometheus metrics
│   │   ├── config.js / db.js   env config, Knex connection
│   │   └── server.js           runs migrations + seed, starts server, graceful shutdown
│   ├── migrations/             Knex migrations (schema versioning)
│   ├── seeds/                  idempotent sample data
│   ├── tests/                  Jest + Supertest tests (pg-mem test DB)
│   ├── knexfile.js
│   └── Dockerfile
├── frontend/                   React app
│   ├── src/                    App.jsx, ItemForm.jsx, api.js, styles.css
│   ├── nginx.conf.template     static hosting + /api proxy + security headers
│   └── Dockerfile              multi-stage: node build → nginx-unprivileged
├── docker-compose.yml          full local stack (postgres + backend + frontend)
├── .github/workflows/ci-cd.yml CI/CD pipeline
├── terraform/                  AWS VPC + EKS (+ EBS CSI IRSA role)
├── k8s/                        namespace (Pod Security) + gp3 StorageClass
├── helm/stockpile/             Helm chart (values.yaml, values-dev.yaml, values-prod.yaml)
├── argocd/application.yaml     ArgoCD Application (GitOps)
├── monitoring/                 kube-prometheus-stack values + Grafana dashboard
├── troubleshooting/            deliberately broken manifests for the debugging lab
├── scripts/load-test.sh        in-cluster load generator for the HPA demo
├── demo/                       presentation video + slides (submission)
├── README.md
└── DEPLOYMENT_GUIDE.md
```

---

## 4. The application

### REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness: the process is up (does not touch the DB) |
| GET | `/ready` | Readiness: the DB is reachable (`select 1`); returns 503 otherwise |
| GET | `/metrics` | Prometheus metrics |
| GET | `/api/items` | List items. Query: `search`, `category`, `lowStock=true` |
| GET | `/api/items/stats` | Totals: products, units, inventory value, low-stock count, per-category counts |
| GET | `/api/items/:id` | Get one item |
| POST | `/api/items` | Create an item (`name`, `sku` required; SKU is unique and upper-cased) |
| PUT | `/api/items/:id` | Update any subset of fields |
| PATCH | `/api/items/:id/stock` | Adjust stock by `{ "delta": n }`; refuses to go below zero |
| DELETE | `/api/items/:id` | Delete an item |

Errors are JSON: `400` bad id or malformed JSON, `404` not found, `409` duplicate SKU, `422` validation errors.

```bash
curl -X POST http://localhost:4000/api/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"Desk Lamp","sku":"FURN-100","category":"Furniture","quantity":12,"unit_price":29.99,"reorder_level":4}'
```

### Database and migrations

- The `items` table is created by a versioned **Knex migration** in `backend/migrations/` (the Node.js equivalent of Alembic). Applied migrations are tracked in the `knex_migrations` table.
- Prices are stored as **integer cents** (`unit_price_cents`) to avoid floating-point rounding. The API exposes them as decimal `unit_price`.
- The backend runs `migrate.latest()` on startup. Knex takes a lock, so several replicas starting at once is safe. Sample data is seeded only into an empty table.

```bash
cd backend
npm run migrate            # apply migrations
npm run migrate:rollback   # undo the last batch
```

### Metrics exposed

| Metric | Type | Labels |
|--------|------|--------|
| `http_requests_total` | counter | method, route, status_code |
| `http_request_duration_seconds` | histogram | method, route, status_code |
| `stockpile_low_stock_items` | gauge | – (business metric, read from the DB at scrape time) |
| `process_*`, `nodejs_*` | defaults | CPU, memory, event-loop lag, GC |

The `route` label uses the route pattern (`/api/items/:id`) rather than the raw URL, which keeps label cardinality low.

---

## 5. Run locally

### Docker Compose (whole stack)

```bash
docker compose up --build
```

| URL | What |
|-----|------|
| http://localhost:3000 | StockPile UI |
| http://localhost:4000/health | backend liveness |
| http://localhost:4000/api/items | API |
| http://localhost:4000/metrics | Prometheus metrics |

Stop with `docker compose down`. Add `-v` to also delete the database volume.

### Without Docker (for development)

```bash
docker compose up -d postgres          # just the database
cd backend  && npm install && npm run dev      # http://localhost:4000
cd frontend && npm install && npm run dev      # http://localhost:3000 (proxies /api to :4000)
```

---

## 6. Testing

```bash
cd backend
npm test           # Jest + coverage
npx jest --verbose # one line per test
```

- **24 tests** across health, readiness, metrics and every items endpoint (happy paths, validation, 404/409/422, stock adjustments, stats).
- Each test gets a **fresh in-memory PostgreSQL** (pg-mem) with the real migrations and seed applied. Tests never touch a real or production database and need no running Postgres, locally or in CI.
- Jest configuration is in `backend/package.json` under `"jest"`.

---

## 7. Docker images

| Image | Build | Runtime | User |
|-------|-------|---------|------|
| backend | `npm ci --omit=dev` in a deps stage | `node:22-alpine`, `apk upgrade`, npm/yarn removed | `node` (uid 1000) |
| frontend | `node:22-alpine` → `npm run build` | `nginxinc/nginx-unprivileged:1.30-alpine`, listens on 8080 | `nginx` (uid 101) |

Both images run as non-root and work with a **read-only root filesystem**. The Helm chart enforces this.

---

## 8. CI/CD pipeline (`.github/workflows/ci-cd.yml`)

Triggers: push to `main`, pull requests to `main`, manual run.

| Stage | Job | What it does |
|-------|-----|--------------|
| 1 | `test-backend` | `npm ci`, **Jest tests** (any failure stops the pipeline), `npm audit --omit=dev --audit-level=high` |
| 1 | `build-frontend` | `npm ci`, **Vite production build**, npm audit |
| 1 | `validate-iac` | `terraform fmt -check`, `terraform validate`, `helm lint`, `helm template` |
| 2 | `build-scan-push` (matrix: backend, frontend) | Build image → **Trivy** scan, failing on fixable HIGH/CRITICAL → push to **GHCR** tagged with the **commit SHA** (no `latest`). Pull requests build and scan but never push. |
| 3 | `gitops-update` (main only) | `yq` writes the new SHA into `helm/stockpile/values-prod.yaml` and commits it (`[skip ci]`). ArgoCD sees the commit and rolls it out. |

Why SHA tags: every running pod can be traced back to the exact commit that built it, and a rollback is just a Git revert.

Why GitOps instead of `helm upgrade` from CI: the pipeline never needs cluster credentials, Git is the single source of truth, and ArgoCD's self-heal reverts manual drift.

---

## 9. DevSecOps controls

| Control | Where |
|---------|-------|
| Container vulnerability scan (OS + library), blocking | Trivy in CI |
| Dependency audit | `npm audit` in CI |
| Pinned scanner versions | trivy-action `0.35.0` + Trivy `v0.69.3`. These are the clean releases after the March 2026 Trivy supply-chain compromise (CVE-2026-33634). Pinning actions to full commit SHAs is the next hardening step. |
| No secrets in Git | `.gitignore` covers `.env`, `*.tfvars`, kubeconfig, state; GHCR auth uses the short-lived `GITHUB_TOKEN` |
| Least-privilege tokens | Workflow default `contents: read`; only the jobs that need it get `packages: write` / `contents: write` |
| Non-root, read-only, no capabilities | Dockerfiles + Helm `securityContext` |
| Pod Security Admission `restricted` | `k8s/namespace.yaml` |
| Network segmentation | NetworkPolicy: only backend pods may reach PostgreSQL (VPC CNI policy enforcement enabled in Terraform) |
| Encrypted storage | gp3 StorageClass with `encrypted: "true"` |
| HTTP hardening | helmet (API), nginx security headers, `server_tokens off` |

---

## 10. Terraform — AWS infrastructure (`terraform/`)

| Resource | Details |
|----------|---------|
| VPC | `10.30.0.0/16` in `ap-south-1`, 2 AZs |
| Subnets | 2 public (tagged for internet-facing ELBs) + 2 private (worker nodes) |
| NAT | single NAT gateway (cost-optimised; one per AZ for real HA) |
| EKS | Kubernetes 1.34, public API endpoint, creator gets cluster-admin |
| Node group | managed, AL2023, `t3.large`, min 2 / desired 2 / max 3 |
| Add-ons | coredns, kube-proxy, vpc-cni (NetworkPolicy on), eks-pod-identity-agent, **aws-ebs-csi-driver** (with an IRSA role) |

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # optional overrides
terraform init
terraform plan
terraform apply
eval "$(terraform output -raw configure_kubectl)"   # writes kubeconfig
terraform destroy                              # when finished!
```

State is local by default. A commented S3 backend block in `versions.tf` shows the team setup.

---

## 11. Kubernetes and Helm

### Chart: `helm/stockpile`

| Template | Resource |
|----------|----------|
| `backend-deployment.yaml` | Express Deployment: wait-for-postgres init container, liveness `/health`, readiness `/ready`, resource limits |
| `frontend-deployment.yaml` | nginx Deployment, 2 replicas |
| `*-service.yaml` | ClusterIP Services (backend `:4000`, frontend `:80`, postgres `:5432`) |
| `postgres-statefulset.yaml` | PostgreSQL StatefulSet with a PVC (volumeClaimTemplate) |
| `postgres-secret.yaml` | DB credentials Secret |
| `ingress.yaml` | `/api` → backend, `/` → frontend |
| `hpa.yaml` | backend HPA, 2–6 replicas at 60% CPU |
| `servicemonitor.yaml` | Prometheus scrape config for `/metrics` |
| `networkpolicy.yaml` | only backend → postgres |

| Values file | Use |
|-------------|-----|
| `values.yaml` | defaults |
| `values-dev.yaml` | local kind/minikube with locally built images, 1 replica, no HPA |
| `values-prod.yaml` | EKS: GHCR images (tag bumped by CI), gp3 storage, HPA, NetworkPolicy |

```bash
kubectl apply -f k8s/namespace.yaml -f k8s/storageclass-gp3.yaml
helm upgrade --install stockpile ./helm/stockpile -n stockpile \
  -f helm/stockpile/values-prod.yaml \
  --set backend.image.tag=<sha> --set frontend.image.tag=<sha>
helm list -n stockpile
helm history stockpile -n stockpile
helm rollback stockpile 1 -n stockpile
```

### GitOps with ArgoCD

`argocd/application.yaml` points ArgoCD at `helm/stockpile` + `values-prod.yaml` on `main`, with automated sync, prune and self-heal. After that, deploying is just `git push`.

---

## 12. Observability

- `monitoring/kube-prometheus-stack-values.yaml` installs Prometheus Operator, Prometheus and Grafana. It is configured to discover ServiceMonitors in every namespace.
- The chart's ServiceMonitor makes Prometheus scrape `stockpile-backend:4000/metrics` every 15s.
- `monitoring/grafana-dashboard.yaml` is a ConfigMap that Grafana's sidecar auto-imports as the **StockPile API** dashboard. Its panels: requests/sec, 5xx error rate, p95 latency, low-stock items, requests by route, latency p50/p95/p99, requests by status code, backend pod count and CPU per pod.

---

## 13. Troubleshooting lab

See [troubleshooting/README.md](troubleshooting/README.md): a broken image tag (`ImagePullBackOff`), a Service whose selector matches nothing (no endpoints), and a bad readiness probe (pod Running but never Ready).

---

## 14. Known issues and limitations

- **PostgreSQL runs in-cluster** as a single-replica StatefulSet. That is fine for a demo, but production should use Amazon RDS (backups, Multi-AZ, patching).
- **DB and Grafana passwords** have classroom defaults in values files. Override them with `--set`; production should use External Secrets / AWS Secrets Manager.
- **No TLS/DNS.** The app is served over plain HTTP on the ELB hostname. Production would add cert-manager or ACM and a Route 53 record.
- **ingress-nginx** is used because the course uses it, but the upstream project was retired in March 2026. Migrating to the AWS Load Balancer Controller or the Gateway API is the long-term path.
- **Single NAT gateway** and local Terraform state keep cost and setup low, but are not HA or team-ready.
- **No authentication** on the app. It is a single-tenant demo.
- **GitOps bot commit**: if `main` has branch protection that blocks direct pushes, allow `github-actions[bot]` to bypass it or switch the job to open a PR.
