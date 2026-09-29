# Provider Contract

Every provider adapter must implement the same lifecycle:

1. Authenticate using a server-side credential reference.
2. Report health without exposing secrets.
3. Declare capabilities.
4. Validate normalized input.
5. Execute one named action.
6. Normalize errors and audit metadata.

Provider-specific raw API access is intentionally not part of the contract.

## Capability declaration

Each capability declares at least:

- stable action name
- human-readable description
- input schema
- output schema
- risk class
- required MCP scope
- resource selector rules
- idempotency behavior where applicable

This keeps policy enforcement independent of individual provider implementations.
