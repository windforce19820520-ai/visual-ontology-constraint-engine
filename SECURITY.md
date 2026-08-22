# Security Policy

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/security/advisories/new). It is enabled for this repository. Do not open a public issue containing credentials, personal images, signed URLs, private request data, or exploit details.

The security scope includes the Public Playground's server-issued sessions, upload and generated-result access controls, BYOK handling, operator-managed credentials, quota or trusted-proxy bypasses, Provider error redaction, and sensitive runtime logging. Include only the minimum sanitized evidence needed to reproduce the issue.

## Sensitive data

Do not commit or attach:

- API keys, access keys, cookies, tokens, or signing secrets;
- real user images or biometric data;
- Base64 image payloads;
- temporary or signed provider URLs;
- private product source code, assets, or deployment configuration.

## Provider safety

Real analyzer, generator, and postprocessor calls must be opt-in. Adapters must redact secrets and image payloads from diagnostics, enforce call and retry budgets, and fail before network execution when capabilities or configuration are incomplete.

## Supported versions

The project is currently in incubation and has no supported production release. A supported-version table will be added with `v0.1.0`.
