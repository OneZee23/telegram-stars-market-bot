# Kubernetes & Helm Configuration

This directory contains Kubernetes deployment configuration using Helm charts.

## Structure

```
.helm/
├── Chart.yaml                  # Helm chart metadata
├── values.yaml                 # Default values (non-sensitive)
├── values-prod.yaml            # Production overrides
├── secret-values-prod.yaml     # Encrypted secrets (SAFE to commit)
├── secret/
│   └── dockerconfig            # Encrypted Docker registry credentials
└── templates/
    ├── deployment.yaml         # Kubernetes Deployment
    ├── service.yaml            # Kubernetes Service
    ├── configuration.yaml      # ConfigMap for environment variables
    ├── docker-config.yaml      # Secret for Docker registry
    └── ingress.yaml            # Ingress for external access
```

## Configuration Files

### `values.yaml`
Base configuration with default values:
- Application port
- Non-sensitive public configuration
- Resource limits
- Health check probes
- Service and Ingress settings

### `values-prod.yaml`
Production-specific overrides:
- Replica count
- Resource allocation
- Production URLs

### `secret-values-prod.yaml`
Encrypted sensitive configuration:
- Database credentials
- API keys
- Bot tokens
- Payment gateway secrets

**IMPORTANT**: This file is encrypted using `werf helm secret` and is SAFE to commit to git.

## Usage

### First-time setup

1. Generate encryption key:
```bash
werf helm secret generate-secret-key > ../.werf_secret_key
```

2. Encrypt secrets:
```bash
export WERF_SECRET_KEY=$(cat ../.werf_secret_key)
werf helm secret values edit secret-values-prod.yaml
```

3. Fill in real values and save.

### Deployment

```bash
# Set environment variables
export KUBECONFIG=~/.kube/config-timeweb
export WERF_SECRET_KEY=$(cat .werf_secret_key)

# Deploy to production
werf converge \
  --repo ghcr.io/onezee/telegram-stars-market-bot \
  --env prod \
  --release telegram-stars-market-bot \
  --namespace telegram-stars-market
```

### Updating secrets

```bash
export WERF_SECRET_KEY=$(cat ../.werf_secret_key)
werf helm secret values edit secret-values-prod.yaml
```

### Viewing encrypted secrets

```bash
export WERF_SECRET_KEY=$(cat ../.werf_secret_key)
werf helm secret values decrypt secret-values-prod.yaml
```

## Environment Variables

All environment variables are configured through `values.yaml` (public) and `secret-values-prod.yaml` (encrypted).

They are injected into the application via ConfigMap (see `templates/configuration.yaml`).

### Adding new variables

1. **Non-sensitive** → Add to `publicConfig` in `values.yaml`
2. **Sensitive** → Add to `secretConfig` in encrypted `secret-values-prod.yaml`

## Health Checks

Application must expose health check endpoints for Kubernetes probes:
- Startup probe: `/` (checks if app has started)
- Liveness probe: `/` (checks if app is alive)
- Readiness probe: `/` (checks if app is ready to receive traffic)

Current configuration in `values.yaml`:
- Startup: 5s delay, 2s interval, 30 retries
- Liveness: 10s delay, 10s interval
- Readiness: 5s delay, 5s interval

## Ingress

Ingress exposes the following paths:
- `/telegram/webhook` - Telegram Bot webhooks
- `/yookassa/webhook` - YooKassa payment webhooks

TLS certificate is automatically issued by Let's Encrypt via cert-manager.

## Resources

Default resource allocation:
- Requests: 100m CPU, 256Mi RAM
- Limits: 500m CPU, 512Mi RAM

Production overrides in `values-prod.yaml`:
- Requests: 200m CPU, 384Mi RAM
- Limits: 1000m CPU, 768Mi RAM

Adjust based on actual usage and monitoring data.

## Troubleshooting

### Secrets not decrypting
```bash
# Make sure WERF_SECRET_KEY is set
echo $WERF_SECRET_KEY

# Should output your encryption key
```

### Pod not starting
```bash
# Check pod status
kubectl get pods -n telegram-stars-market

# View logs
kubectl logs -n telegram-stars-market <POD_NAME>

# Describe pod for events
kubectl describe pod -n telegram-stars-market <POD_NAME>
```

### Configuration not updating
```bash
# Check ConfigMap
kubectl get configmap -n telegram-stars-market telegram-stars-market-bot-config -o yaml

# Force pod restart
kubectl rollout restart deployment/telegram-stars-market-bot -n telegram-stars-market
```

## See Also

- [Deployment Guide](../docs/DEPLOYMENT.md) - Full deployment instructions
- [Quick Start](../docs/QUICKSTART_TIMEWEB.md) - Fast-track deployment guide
- [werf Documentation](https://werf.io/documentation/) - Official werf docs

