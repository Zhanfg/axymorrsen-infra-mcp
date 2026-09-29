# Release and distribution

The repository uses the version in `package.json` as the release identity.

A push to `main` runs the release workflow. If a GitHub Release named `v<version>` already exists, the publish job is skipped. If it does not exist, the workflow performs the full verification suite and publishes the release.

## Outputs

Each release produces:

- a GitHub Release tagged `v<version>`
- a prebuilt Node runtime bundle
- a CycloneDX SBOM
- SHA-256 checksums
- a multi-architecture OCI image for `linux/amd64` and `linux/arm64`
- a GitHub artifact provenance attestation for the OCI image

The OCI image name is derived from the repository:

```text
ghcr.io/<owner>/<repository>:<version>
```

Stable aliases are also published for `<major>.<minor>`, `<major>`, and `latest`.

## Release safety

The release workflow:

- runs only from the `main` branch
- refuses non-stable package versions
- re-runs audit, typecheck, tests, and build before publishing
- pins every reusable GitHub Action to an immutable commit SHA
- serializes releases through a concurrency group
- grants write permissions only to the publish job
- creates a new release only when the version has not already been released

## GHCR visibility

GitHub Container Registry packages created under a personal account may initially be private even when the source repository is public. The GitHub Release bundle remains publicly downloadable from a public repository.

If anonymous OCI pulls are required, change the package visibility to Public once from the package settings after the first successful publication.

## Node bundle

After extracting the Node bundle:

```sh
npm ci --omit=dev --ignore-scripts
```

Run the remote HTTP gateway:

```sh
node dist/index.js
```

Or run the stdio bridge:

```sh
MCP_REMOTE_URL=https://mcp.example.com/mcp \
MCP_BRIDGE_TOKEN=<SHORT_LIVED_MCP_TOKEN> \
node dist/bridge/stdio-remote.js
```
