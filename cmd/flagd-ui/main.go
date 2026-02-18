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
	)
	flag.Parse()

	if (*flagDir == "" && *syncAddr == "") || (*flagDir != "" && *syncAddr != "") {
		fmt.Fprintln(os.Stderr, "error: exactly one of -flag-dir or -sync-addr is required")
		flag.Usage()
		os.Exit(1)
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
		serveFrontend(mux)
	}

	log.Printf("flagd-ui listening on %s", *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatal(err)
	}
}

func serveFrontend(mux *http.ServeMux) {
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

	fileServer := http.FileServer(http.FS(distFS))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			path = "/index.html"
		}

		f, err := distFS.Open(path[1:])
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
	log.Printf("serving embedded frontend")
}
