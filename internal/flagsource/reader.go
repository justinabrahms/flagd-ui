package flagsource

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// Flag represents a single flagd feature flag.
type Flag struct {
	Key            string          `json:"key"`
	State          string          `json:"state"`
	Variants       json.RawMessage `json:"variants"`
	DefaultVariant string          `json:"defaultVariant"`
	Targeting      json.RawMessage `json:"targeting,omitempty"`
	Metadata       json.RawMessage `json:"metadata,omitempty"`
	Source         string          `json:"source"` // which file this flag came from
}

// flagFile is the top-level structure of a flagd config file.
type flagFile struct {
	Schema string                     `json:"$schema"`
	Flags  map[string]json.RawMessage `json:"flags"`
}

// flagDef is the per-flag structure inside a flagd config file.
type flagDef struct {
	State          string          `json:"state"`
	Variants       json.RawMessage `json:"variants"`
	DefaultVariant string          `json:"defaultVariant"`
	Targeting      json.RawMessage `json:"targeting,omitempty"`
	Metadata       json.RawMessage `json:"metadata,omitempty"`
}

// Reader reads flagd configuration files from a directory.
type Reader struct {
	dir   string
	mu    sync.RWMutex
	flags []Flag
}

func NewReader(dir string) *Reader {
	return &Reader{dir: dir}
}

// Load reads all JSON files in the directory and parses flags.
func (r *Reader) Load() error {
	entries, err := os.ReadDir(r.dir)
	if err != nil {
		return fmt.Errorf("reading directory %s: %w", r.dir, err)
	}

	var flags []Flag
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := filepath.Ext(entry.Name())
		if ext != ".json" {
			continue
		}

		path := filepath.Join(r.dir, entry.Name())
		parsed, err := parseFile(path)
		if err != nil {
			// Skip files that aren't valid flagd configs (e.g. package.json)
			continue
		}
		flags = append(flags, parsed...)
	}

	// Also check subdirectories one level deep for flags.json files
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		subFlags, err := r.loadSubdir(filepath.Join(r.dir, entry.Name()))
		if err != nil {
			continue
		}
		flags = append(flags, subFlags...)
	}

	r.mu.Lock()
	r.flags = flags
	r.mu.Unlock()
	return nil
}

func (r *Reader) loadSubdir(dir string) ([]Flag, error) {
	var flags []Flag
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			return nil
		}
		if filepath.Ext(path) != ".json" {
			return nil
		}
		parsed, err := parseFile(path)
		if err != nil {
			return nil
		}
		flags = append(flags, parsed...)
		return nil
	})
	return flags, err
}

func parseFile(path string) ([]Flag, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var file flagFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, err
	}

	if file.Flags == nil {
		return nil, fmt.Errorf("not a flagd config file: %s", path)
	}

	var flags []Flag
	for key, raw := range file.Flags {
		var def flagDef
		if err := json.Unmarshal(raw, &def); err != nil {
			continue
		}
		flags = append(flags, Flag{
			Key:            key,
			State:          def.State,
			Variants:       def.Variants,
			DefaultVariant: def.DefaultVariant,
			Targeting:      def.Targeting,
			Metadata:       def.Metadata,
			Source:         filepath.Base(path),
		})
	}
	return flags, nil
}

// Flags returns all loaded flags.
func (r *Reader) Flags() []Flag {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Flag, len(r.flags))
	copy(out, r.flags)
	return out
}

// Flag returns a single flag by key, or false if not found.
func (r *Reader) Flag(key string) (Flag, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, f := range r.flags {
		if f.Key == key {
			return f, true
		}
	}
	return Flag{}, false
}
