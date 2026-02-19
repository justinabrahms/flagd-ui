# flagd-ui

A read-only management interface for [flagd](https://flagd.dev), the CNCF OpenFeature-aligned feature flag daemon.

![flagd-ui demo](demo/recording/flagd-ui-demo.gif)

## Quick start

### File-based

```bash
docker run --rm -p 9090:9090 -v /path/to/your/flags:/data ghcr.io/justinabrahms/flagd-ui -flag-dir /data
```

### gRPC sync (connect to a running flagd instance)

```bash
docker run --rm -p 9090:9090 ghcr.io/justinabrahms/flagd-ui -sync-addr flagd:8015
```

Open http://localhost:9090 to browse your feature flags.

## Install

### Docker (recommended)

```bash
docker pull ghcr.io/justinabrahms/flagd-ui
```

### Binary

Download from [GitHub Releases](https://github.com/justinabrahms/flagd-ui/releases), then:

```bash
./flagd-ui -flag-dir /path/to/flagd-config
```

### Build from source

Requires Go 1.24+ and Node.js 20+.

```bash
make build
./flagd-ui -flag-dir ./demo
```

## CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `-flag-dir` | | Path to directory containing flagd JSON config files |
| `-sync-addr` | | flagd gRPC sync address (e.g. `localhost:8015`) |
| `-addr` | `:9090` | Listen address |
| `-base-path` | | URL prefix when running behind a reverse proxy (e.g. `/flagd-ui`) |
| `-dev-proxy` | | Proxy frontend requests to a Vite dev server (development only) |

Exactly one of `-flag-dir` or `-sync-addr` is required.

## Kubernetes

### gRPC sync (recommended)

Connect to an existing flagd service:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flagd-ui
spec:
  replicas: 1
  selector:
    matchLabels:
      app: flagd-ui
  template:
    metadata:
      labels:
        app: flagd-ui
    spec:
      containers:
        - name: flagd-ui
          image: ghcr.io/justinabrahms/flagd-ui:latest
          args: ["-sync-addr", "flagd.flagd-system.svc:8015"]
          ports:
            - containerPort: 9090
```

### File-based (ConfigMap)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flagd-ui
spec:
  replicas: 1
  selector:
    matchLabels:
      app: flagd-ui
  template:
    metadata:
      labels:
        app: flagd-ui
    spec:
      containers:
        - name: flagd-ui
          image: ghcr.io/justinabrahms/flagd-ui:latest
          args: ["-flag-dir", "/data"]
          ports:
            - containerPort: 9090
          volumeMounts:
            - name: flag-config
              mountPath: /data
              readOnly: true
      volumes:
        - name: flag-config
          configMap:
            name: flagd-config
```

## Development

```bash
# Terminal 1: Go backend with Vite proxy
make dev-backend FLAG_DIR=./demo

# Terminal 2: Vite dev server with HMR
make dev-frontend
```

## License

Apache 2.0
