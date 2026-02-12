package api

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"

	"github.com/justinabrahms/flagd-ui/internal/flagsource"
)

type Handler struct {
	reader *flagsource.Reader
}

func NewHandler(reader *flagsource.Reader) *Handler {
	return &Handler{reader: reader}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/flags", h.listFlags)
	mux.HandleFunc("GET /api/flags/{key}", h.getFlag)
}

type listResponse struct {
	Flags []flagsource.Flag `json:"flags"`
	Total int               `json:"total"`
}

func (h *Handler) listFlags(w http.ResponseWriter, r *http.Request) {
	flags := h.reader.Flags()

	// Search filter
	if q := r.URL.Query().Get("q"); q != "" {
		q = strings.ToLower(q)
		var filtered []flagsource.Flag
		for _, f := range flags {
			if strings.Contains(strings.ToLower(f.Key), q) {
				filtered = append(filtered, f)
			}
		}
		flags = filtered
	}

	// State filter
	if state := r.URL.Query().Get("state"); state != "" {
		state = strings.ToUpper(state)
		var filtered []flagsource.Flag
		for _, f := range flags {
			if f.State == state {
				filtered = append(filtered, f)
			}
		}
		flags = filtered
	}

	// Sort by key
	sort.Slice(flags, func(i, j int) bool {
		return flags[i].Key < flags[j].Key
	})

	writeJSON(w, listResponse{Flags: flags, Total: len(flags)})
}

func (h *Handler) getFlag(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	flag, ok := h.reader.Flag(key)
	if !ok {
		http.Error(w, `{"error":"flag not found"}`, http.StatusNotFound)
		return
	}
	writeJSON(w, flag)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	enc.Encode(v)
}
