# Troubleshooting lab

Each manifest is broken on purpose. Apply it, diagnose with `kubectl`, explain the root cause, then delete it.

| File | Symptom | Where to look | Root cause |
|------|---------|---------------|------------|
| `broken-image.yaml` | Pod stuck in `ImagePullBackOff` / `ErrImagePull` | `kubectl describe pod`, events | Image tag does not exist |
| `broken-service.yaml` | Service has no endpoints; requests time out | `kubectl get endpoints`, `kubectl get pods --show-labels` | Selector matches no pod labels |
| `broken-readiness.yaml` | Pod `Running` but `0/1 READY`, never receives traffic | `kubectl describe pod` (Readiness probe failed: 404) | Probe points to a path that does not exist |

```bash
kubectl apply -f troubleshooting/broken-image.yaml
kubectl get pods -n stockpile
kubectl describe pod -n stockpile -l app=broken-image
kubectl get events -n stockpile --sort-by=.lastTimestamp | tail
kubectl delete -f troubleshooting/broken-image.yaml
```
