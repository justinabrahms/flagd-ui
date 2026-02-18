package flagsource

import (
	"encoding/json"
	"testing"
)

func TestParseFlagJSON_SingleFlag(t *testing.T) {
	input := []byte(`{
		"$schema": "https://flagd.dev/schema/v0/flags.json",
		"flags": {
			"my-flag": {
				"state": "ENABLED",
				"variants": {"on": true, "off": false},
				"defaultVariant": "on"
			}
		}
	}`)

	flags, err := ParseFlagJSON(input, "test-source")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(flags) != 1 {
		t.Fatalf("expected 1 flag, got %d", len(flags))
	}

	f := flags[0]
	if f.Key != "my-flag" {
		t.Errorf("expected key %q, got %q", "my-flag", f.Key)
	}
	if f.State != "ENABLED" {
		t.Errorf("expected state %q, got %q", "ENABLED", f.State)
	}
	if f.DefaultVariant != "on" {
		t.Errorf("expected defaultVariant %q, got %q", "on", f.DefaultVariant)
	}
	// Variants is json.RawMessage, so round-trip through compact form to
	// compare without worrying about whitespace from the original input.
	var got map[string]any
	if err := json.Unmarshal(f.Variants, &got); err != nil {
		t.Fatalf("variants is not valid JSON: %v", err)
	}
	if got["on"] != true || got["off"] != false {
		t.Errorf("unexpected variants content: %s", f.Variants)
	}
}

func TestParseFlagJSON_MultipleFlags(t *testing.T) {
	input := []byte(`{
		"flags": {
			"flag-a": {
				"state": "ENABLED",
				"variants": {"on": true, "off": false},
				"defaultVariant": "on"
			},
			"flag-b": {
				"state": "DISABLED",
				"variants": {"red": "red", "blue": "blue"},
				"defaultVariant": "red"
			}
		}
	}`)

	flags, err := ParseFlagJSON(input, "multi")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(flags) != 2 {
		t.Fatalf("expected 2 flags, got %d", len(flags))
	}

	byKey := make(map[string]Flag, len(flags))
	for _, f := range flags {
		byKey[f.Key] = f
	}

	if _, ok := byKey["flag-a"]; !ok {
		t.Error("missing flag-a")
	}
	if _, ok := byKey["flag-b"]; !ok {
		t.Error("missing flag-b")
	}
}

func TestParseFlagJSON_MissingFlagsKey(t *testing.T) {
	input := []byte(`{"not-flags": {}}`)

	_, err := ParseFlagJSON(input, "source")
	if err == nil {
		t.Fatal("expected error for missing flags key, got nil")
	}
}

func TestParseFlagJSON_InvalidJSON(t *testing.T) {
	input := []byte(`{not json`)

	_, err := ParseFlagJSON(input, "source")
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

func TestParseFlagJSON_SourcePassthrough(t *testing.T) {
	input := []byte(`{
		"flags": {
			"x": {
				"state": "ENABLED",
				"variants": {"v": 1},
				"defaultVariant": "v"
			}
		}
	}`)

	flags, err := ParseFlagJSON(input, "my-config.json")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(flags) != 1 {
		t.Fatalf("expected 1 flag, got %d", len(flags))
	}
	if flags[0].Source != "my-config.json" {
		t.Errorf("expected source %q, got %q", "my-config.json", flags[0].Source)
	}
}
