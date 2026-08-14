# M1 implementation notes

- M1 uses a minimal RFC 8785/JCS-compatible projection: lexically sorted object keys, JSON number serialization, and semantic array order. Volatile values are the caller's responsibility; the hash helper excludes only the named self field.
- Runtime validation is intentionally limited to the M1 public records and manifest safety invariants. Scenario resolution, contribution loading, and business pipelines remain outside M1.
- The public contract's open contribution types are represented as `unknown[]` in the first contract foundation so M1 does not invent unratified schemas.
