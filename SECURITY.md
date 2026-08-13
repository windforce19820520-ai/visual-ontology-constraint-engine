# Security Policy

## Reporting a vulnerability

Please use GitHub private vulnerability reporting when it is available for this repository. Do not open a public issue containing credentials, personal images, signed URLs, or exploit details.

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
