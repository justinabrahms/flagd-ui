package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"

	"github.com/justinabrahms/flagd-ui/internal/api"
	"github.com/justinabrahms/flagd-ui/internal/flagsource"
	"github.com/justinabrahms/flagd-ui/web"
)

func main() {
	var (
		addr     = flag.String("addr", ":9090", "listen address")
		flagDir  = flag.String("flag-dir", "", "path to directory containing flagd config files")
		devProxy = flag.String("dev-proxy", "", "proxy non-API requests to this URL (e.g. http://localhost:5173 for Vite)")
	)
	flag.Parse()

	if *flagDir == "" {
		fmt.Fprintln(os.Stderr, "error: -flag-dir is required")
		flag.Usage()
		os.Exit(1)
	}

	reader := flagsource.NewReader(*flagDir)
	if err := reader.Load(); err != nil {
		log.Fatalf("loading flags from %s: %v", *flagDir, err)
	}

	flags := reader.Flags()
	log.Printf("loaded %d flags from %s", len(flags), *flagDir)

	mux := http.NewServeMux()

	// API routes
	handler := api.NewHandler(reader)
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
