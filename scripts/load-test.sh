#!/usr/bin/env bash
# Generates load from INSIDE the cluster so the backend HPA scales up.
# Usage: ./scripts/load-test.sh [duration-seconds] [parallel-workers]
# Watch it in another terminal:  kubectl get hpa -n stockpile -w
set -euo pipefail

DURATION="${1:-180}"
WORKERS="${2:-20}"
NAMESPACE="${NAMESPACE:-stockpile}"
TARGET="${TARGET:-http://stockpile-backend:4000/api/items/stats}"

echo "Hitting $TARGET with $WORKERS workers for ${DURATION}s..."
kubectl run stockpile-load -n "$NAMESPACE" --rm -i --restart=Never \
  --image=busybox:1.37 \
  --overrides='{"spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":65534,"seccompProfile":{"type":"RuntimeDefault"}},"containers":[{"name":"stockpile-load","image":"busybox:1.37","stdin":true,"securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}}}]}}' \
  -- sh -c "
    end=\$((\$(date +%s) + $DURATION))
    for w in \$(seq 1 $WORKERS); do
      ( while [ \$(date +%s) -lt \$end ]; do wget -q -O /dev/null $TARGET; done ) &
    done
    wait
    echo 'Load test finished'
  "
