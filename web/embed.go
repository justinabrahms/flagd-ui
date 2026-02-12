package web

import "embed"

// DistFS contains the built frontend assets.
// The dist/ directory is populated by the Makefile before `go build`.
// In dev mode, this will be empty — use -dev-proxy instead.

//go:embed all:dist
var DistFS embed.FS
