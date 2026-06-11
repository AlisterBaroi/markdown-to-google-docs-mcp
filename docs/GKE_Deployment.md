# Deploying to Google Kubernetes Engine (GKE)

This guide deploys **Markdown → Google Docs** to a GKE cluster. The app ships as a single
container (a Node/Express server that also serves the built client), so the Kubernetes objects are
minimal: a **Deployment**, a **Service**, and an **Ingress** for a public HTTPS URL.

> Prefer the simplest path? [Cloud Run](./CloudRun_Deployment.md) is less work for this app. Use GKE
> if you already run a cluster or need to co-locate it with other workloads.

---

## Key facts about this app (they shape the manifests)

- **Listens on `$PORT`** (defaults to `3000`; we set `8080` below).
- **Health endpoint:** `GET /api/health` — used for liveness/readiness probes.
- **Memory:** allow **~2Gi** — server-side Mermaid rendering runs headless Chromium.
- **Run a single replica** (`replicas: 1`). MCP session state and the temporary diagram-image host
  live **in memory**, so the SSE connection and its follow-up calls must hit the **same** pod. (The
  MCP bridge doesn't carry cookies, so `Service` session affinity won't help — keep it to one pod.)
- **`VITE_*` Firebase config is baked into the image at build time** (Docker `--build-arg`), *not*
  passed as runtime env. So the Deployment needs **no** Firebase secrets.
- Chromium runs with `--disable-dev-shm-usage` (set in code), so the default small `/dev/shm`
  isn't a problem.

## 1. Prerequisites

- A GKE cluster + `kubectl` configured (`gcloud container clusters get-credentials …`).
- An **Artifact Registry** Docker repo, and the **Docs/Drive APIs + Firebase** set up (see the
  [Cloud Run guide](./CloudRun_Deployment.md) §1–3 for API enablement and the Firebase/OAuth setup).

## 2. Build & push the image (with the build-time config)

The `VITE_*` values must be passed as build args (see [`cloudbuild.yaml`](../cloudbuild.yaml) / the
[Dockerfile](../Dockerfile)):

```bash
REGION=us-central1
PROJECT=my-gcp-project
REPO=cloud-run-source-deploy
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/markdown-to-google-docs-mcp:v1"

docker build -t "$IMAGE" \
  --build-arg VITE_FIREBASE_API_KEY=... \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com \
  --build-arg VITE_FIREBASE_PROJECT_ID=your-project \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=... \
  --build-arg VITE_FIREBASE_APP_ID=... \
  --build-arg VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com \
  .
docker push "$IMAGE"
```

## 3. Deployment + Service

The manifest ships with the repo at **[`k8s/deployment.yaml`](../k8s/deployment.yaml)** — a
single-replica **Deployment** (port 8080, `/api/health` liveness+readiness probes, up to 2Gi for
Chromium) plus a `ClusterIP` **Service**. **Edit the `image:` field** to the path you pushed in
step 2, then apply:

```bash
kubectl apply -f k8s/deployment.yaml
kubectl rollout status deployment/markdown-to-google-docs-mcp
```

## 4. Expose it publicly (Ingress + managed TLS)

A public HTTPS URL is **required** — Google's servers fetch rendered Mermaid images over the public
internet, and Google sign-in needs a real origin.

The repo ships **[`k8s/ingress.yaml`](../k8s/ingress.yaml)** — a GKE `Ingress` plus a Google-managed
TLS certificate (`ManagedCertificate`). **Edit `docs.example.com` to your domain** (it appears in two
places), then apply:

```bash
kubectl apply -f k8s/ingress.yaml
kubectl get ingress markdown-to-google-docs-mcp   # note the external IP, point your DNS at it
```

(No simpler option needed? `kubectl patch svc markdown-to-google-docs-mcp -p '{"spec":{"type":"LoadBalancer"}}'`
gives you a plain external IP — but you won't get HTTPS/a domain, which sign-in really wants.)

## 5. Register the URL (required for sign-in)

Add your domain to **both** allowlists (same as the Cloud Run guide §6):
- **Firebase → Authentication → Authorized domains** → `docs.example.com`
- **Google Cloud → Credentials → OAuth Web client → Authorized JavaScript origins** → `https://docs.example.com`

Then restrict who can sign in via the Google/Firebase console (OAuth consent screen → **Internal**)
if you want org-only access — see the [Cloud Run guide](./CloudRun_Deployment.md#6-post-deploy-register-the-cloud-run-url).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Pod `CrashLoopBackOff`, OOMKilled during conversion | Chromium needs memory | raise the memory limit (≥ 2Gi) |
| Mermaid diagrams blank in the doc | image URL not publicly reachable | ensure the Ingress/domain is live and public |
| Sign-in `Error 400: origin_mismatch` | origin not authorized | add the domain to the OAuth JS origins (§5) |
| MCP tool intermittently "session not found" | more than one pod | set `replicas: 1` |
