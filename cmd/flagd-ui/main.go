package main

import (
	"context"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/justinabrahms/flagd-ui/internal/api"
	"github.com/justinabrahms/flagd-ui/internal/flagsource"
	"github.com/justinabrahms/flagd-ui/web"
)

func main() {
	var (
		addr     = flag.String("addr", ":9090", "listen address")
		flagDir  = flag.String("flag-dir", "", "path to directory containing flagd config files")
		syncAddr = flag.String("sync-addr", "", "flagd gRPC sync address (e.g. localhost:8015)")
		devProxy = flag.String("dev-proxy", "", "proxy non-API requests to this URL (e.g. http://localhost:5173 for Vite)")
		basePath = flag.String("base-path", "", "URL prefix when running behind a reverse proxy (e.g. /flagd-ui)")
	)
	flag.Parse()

	if (*flagDir == "" && *syncAddr == "") || (*flagDir != "" && *syncAddr != "") {
		fmt.Fprintln(os.Stderr, "error: exactly one of -flag-dir or -sync-addr is required")
		flag.Usage()
		os.Exit(1)
	}

	// Normalize base path: ensure leading slash, strip trailing slash
	bp := strings.TrimSpace(*basePath)
	if bp != "" {
		if !strings.HasPrefix(bp, "/") {
			bp = "/" + bp
		}
		bp = strings.TrimRight(bp, "/")
	}

	var source flagsource.FlagSource

	if *syncAddr != "" {
		syncer := flagsource.NewGRPCSyncer(*syncAddr)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := syncer.Start(ctx); err != nil {
			log.Fatalf("grpc sync to %s: %v", *syncAddr, err)
		}
		source = syncer
		log.Printf("syncing flags from %s via gRPC", *syncAddr)
	} else {
		reader := flagsource.NewReader(*flagDir)
		if err := reader.Load(); err != nil {
			log.Fatalf("loading flags from %s: %v", *flagDir, err)
		}
		log.Printf("loaded %d flags from %s", len(reader.Flags()), *flagDir)
		source = reader
	}

	mux := http.NewServeMux()

	// API routes
	handler := api.NewHandler(source)
	handler.RegisterRoutes(mux)

	// Frontend
	if *devProxy != "" {
		target, err := url.Parse(*devProxy)
		if err != nil {
			log.Fatalf("invalid dev-proxy URL: %v", err)
		}
		proxy := httputil.NewSingleHostReverseProxy(target)
		mux.Handle("GET /", proxy)
		log.Printf("proxying frontend to %s", *devProxy)
	} else {
		serveFrontend(mux, bp)
	}

	var root http.Handler = mux
	if bp != "" {
		outer := http.NewServeMux()
		outer.Handle(bp+"/", http.StripPrefix(bp, mux))
		root = outer
		log.Printf("serving under base path %s", bp)
	}

	log.Printf("flagd-ui listening on %s", *addr)
	if err := http.ListenAndServe(*addr, root); err != nil {
		log.Fatal(err)
	}
}

func serveFrontend(mux *http.ServeMux, basePath string) {
	distFS, err := fs.Sub(web.DistFS, "dist")
	if err != nil {
		log.Printf("warning: no embedded frontend, API-only mode")
		return
	}

	// Check if the embedded FS has content
	entries, err := fs.ReadDir(distFS, ".")
	if err != nil || len(entries) == 0 {
		log.Printf("warning: embedded frontend is empty, API-only mode")
		return
	}

	// Read index.html once and inject base path script
	indexBytes, err := fs.ReadFile(distFS, "index.html")
	if err != nil {
		log.Printf("warning: no index.html in embedded frontend")
		return
	}
	indexHTML := string(indexBytes)
	if basePath != "" {
		injection := fmt.Sprintf(`<script>window.__BASE_PATH__="%s"</script>`, basePath)
		indexHTML = strings.Replace(indexHTML, "<head>", "<head>"+injection, 1)
	}

	fileServer := http.FileServer(http.FS(distFS))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			fmt.Fprint(w, indexHTML)
			return
		}

		f, err := distFS.Open(path[1:])
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback — serve modified index.html
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, indexHTML)
	})
	log.Printf("serving embedded frontend")
}
