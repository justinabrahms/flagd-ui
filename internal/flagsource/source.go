package flagsource

// FlagSource provides read access to feature flags.
type FlagSource interface {
	Flags() []Flag
	Flag(key string) (Flag, bool)
}
