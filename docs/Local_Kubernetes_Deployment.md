# Deploying to a local Kubernetes cluster (kind)

This guide runs **Markdown → Google Docs** on a local Kubernetes cluster using
[**kind**](https://kind.sigs.k8s.io/) (Kubernetes-in-Docker). It's handy for testing the Kubernetes
manifests before shipping to [GKE](./GKE_Deployment.md). The same approach works with
[minikube](https://minikube.sigs.k8s.io/) or [k3d](https://k3d.io/) with minor command changes.

> ⚠️ **Big caveat up front:** on a local cluster the app is only reachable at `localhost`, and
> **Google's servers cannot fetch `localhost`**. So **Mermaid diagrams won't embed** into Google
> Docs locally (everything else — sign-in, text/table/list conversion — works). Diagram embedding
> needs a public URL (GKE/Cloud Run, or a tunnel like ngrok). The app handles this gracefully: the
> doc is still created, the diagram is just left out.

---

## 1. Prerequisites

- [Docker](https://docs.docker.com/get-docker/), [`kind`](https://kind.sigs.k8s.io/docs/user/quick-start/#installation), and `kubectl`.
- A Firebase project + OAuth Web client (see the [Cloud Run guide](./CloudRun_Deployment.md) §1).

## 2. Create a cluster

```bash
kind create cluster --name mtgd
kubectl cluster-info --context kind-mtgd
```

## 3. Build the image and load it into kind

`kind` doesn't use your local Docker registry directly — you build, then **load** the image into the
cluster. The `VITE_*` values are baked in at build time (see the [Dockerfile](../Dockerfile)):

```bash
docker build -t markdown-to-google-docs-mcp:dev \
  --build-arg VITE_FIREBASE_API_KEY=... \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com \
  --build-arg VITE_FIREBASE_PROJECT_ID=your-project \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=... \
  --build-arg VITE_FIREBASE_APP_ID=... \
  --build-arg VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com \
  .

kind load docker-image markdown-to-google-docs-mcp:dev --name mtgd
```

## 4. Deploy

The manifest ships with the repo at **[`k8s/local.yaml`](../k8s/local.yaml)** — a single-replica
**Deployment** (port 8080, `/api/health` probes, up to 2Gi for Chromium) plus a **Service**. It
references the `markdown-to-google-docs-mcp:dev` image you just loaded, so apply it as-is:

```bash
kubectl apply -f k8s/local.yaml
kubectl rollout status deployment/markdown-to-google-docs-mcp
```

## 5. Access it

Port-forward the Service to your machine:

```bash
kubectl port-forward svc/markdown-to-google-docs-mcp 8080:8080
```

Open **http://localhost:8080**.

For sign-in to work, add the origin to the OAuth Web client's **Authorized JavaScript origins**
(Google Cloud Console → Credentials):

```
http://localhost:8080
```

(`localhost` is already in Firebase's Authorized domains by default.)

## 6. Iterate

After changing code, rebuild → reload → restart the rollout:

```bash
docker build -t markdown-to-google-docs-mcp:dev --build-arg ... .
kind load docker-image markdown-to-google-docs-mcp:dev --name mtgd
kubectl rollout restart deployment/markdown-to-google-docs-mcp
```

> For everyday development you usually don't need Kubernetes at all — `npm run dev` (see the README)
> is faster. Use this when you specifically want to test the container/manifests locally.

## 7. Tear down

```bash
kind delete cluster --name mtgd
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ErrImageNeverPull` / `ImagePullBackOff` | image not loaded into kind | re-run `kind load docker-image …` and ensure `imagePullPolicy: IfNotPresent` |
| Mermaid diagrams blank | Google can't fetch `localhost` | expected locally — deploy to GKE/Cloud Run or use a public tunnel |
| Sign-in `Error 400: origin_mismatch` | origin not authorized | add `http://localhost:8080` to the OAuth JS origins |
| Pod OOMKilled mid-conversion | Chromium memory | raise the memory limit |
