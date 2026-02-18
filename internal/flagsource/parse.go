package flagsource

import (
	"encoding/json"
	"fmt"
)

// Flag represents a single flagd feature flag.
type Flag struct {
	Key            string          `json:"key"`
	State          string          `json:"state"`
	Variants       json.RawMessage `json:"variants"`
	DefaultVariant string          `json:"defaultVariant"`
	Targeting      json.RawMessage `json:"targeting,omitempty"`
	Metadata       json.RawMessage `json:"metadata,omitempty"`
	Source         string          `json:"source"` // provenance (filename or sync address)
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

// ParseFlagJSON parses flagd-format JSON and returns the flags it contains.
// The source string is attached to each returned flag for provenance.
func ParseFlagJSON(data []byte, source string) ([]Flag, error) {
	var file flagFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, err
	}

	if file.Flags == nil {
		return nil, fmt.Errorf("not a flagd config: missing \"flags\" key")
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
			Source:         source,
		})
	}
	return flags, nil
}
