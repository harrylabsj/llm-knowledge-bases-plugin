# Publishing

This package is designed to ship as a public npm package with three first-class surfaces:

- standalone CLI
- stdio MCP server
- OpenClaw-compatible host entry

## Preflight

1. Confirm the package name you want is available on npm.
2. If you want npm page links, add `repository`, `homepage`, and `bugs` in [`package.json`](package.json).
3. Bump `version` in [`package.json`](package.json).
4. Update any release notes you want users to see alongside the publish.

## Release Check

Run the full local release gate:

```bash
npm run release:check
```

This runs:

- `npm run build`
- `npm test`
- `npm pack --dry-run` with a temporary project-local cache path, so it does not depend on your global npm cache permissions

If you only want to inspect the publish tarball contents:

```bash
npm run pack:dry-run
```

## Publish

When the release check passes:

```bash
npm publish --access public
```

## One-Command Local Publish

From the shared workspace root, you can publish the npm runtime and then the ClawHub skill with one command:

```bash
cd /Users/jianghaidong/Library/Mobile\ Documents/com~apple~CloudDocs/codex
npm run publish:llm-kb
```

If you want to bump both versions first, use:

```bash
npm run bump:llm-kb -- --plugin patch --skill patch --skill-changelog "Summarize the release"
```

There is also a convenience patch bump for both:

```bash
npm run bump:llm-kb:patch
```

If npm still requires a one-time password, pass it inline or through `NPM_PUBLISH_OTP`:

```bash
npm run publish:llm-kb -- --otp 123456
```

For true one-command local publishing without OTP prompts, npm currently requires a granular access token with `Bypass two-factor authentication` enabled for write actions. Official docs:

- [About access tokens](https://docs.npmjs.com/about-access-tokens)
- [Creating and viewing access tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens)
- [Requiring 2FA for package publishing](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)

## Post-publish smoke checks

Verify the published binaries resolve:

```bash
npx -y --package @harrylabs/llm-knowledge-bases@<version> llm-knowledge-bases --help
npx -y --package @harrylabs/llm-knowledge-bases@<version> llm-knowledge-bases-mcp --help
npx -y --package @harrylabs/llm-knowledge-bases@<version> llm-knowledge-bases-configs --vault-root /tmp/example
```

Verify the standalone CLI can talk to a vault:

```bash
npx -y --package @harrylabs/llm-knowledge-bases@<version> \
  llm-knowledge-bases kb_status --vault-root /absolute/path/to/your/obsidian-vault
```

Verify the generated MCP snippets still look right:

```bash
npx -y --package @harrylabs/llm-knowledge-bases@<version> \
  llm-knowledge-bases-configs --vault-root /absolute/path/to/your/obsidian-vault
```
