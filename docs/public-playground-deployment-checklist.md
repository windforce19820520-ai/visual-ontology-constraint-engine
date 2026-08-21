# Public Playground PR B deployment checklist

PR A completion does not authorize any item below. PR B must record owner authorization and evidence for each applicable item.

## Infrastructure and secrets

- [ ] Select and authorize the cloud project, region, single-instance service shape, and operator.
- [ ] Authorize domain, DNS, HTTPS certificate, and exact reverse proxy configuration.
- [ ] Configure the proxy and Host body limit at or below 20,100,000 bytes; disable body logging and API caching.
- [ ] Configure only the final trusted proxy CIDRs, or leave forwarded-IP trust disabled.
- [ ] Inject Cloudflare credentials through the platform secret manager only if the experimental preview is enabled.
- [ ] Do not store Seedream or Grok BYOK values as platform or GitHub secrets.

## Cost and abuse controls

- [ ] Set explicit per-session, per-client, Provider-per-minute, global-concurrency, and daily-call limits.
- [ ] Confirm the deployment is exactly one process/instance, or implement and review an atomic durable `RequestQuotaStore` before scaling.
- [ ] Configure independent Cloudflare/Seedream/Grok account or platform hard limits and alerts.
- [ ] Verify that exhausted gates reject before transport with no retry, Provider switch, or paid continuation.

## Privacy and operations

- [ ] Publish the operator-specific privacy notice, retention statement, Provider list, contact, region, and deletion behavior.
- [ ] Verify structured logs contain no API key, image/Base64, full prompt, cookie, raw IP, Provider body, or output URL.
- [ ] Confirm `/healthz` and `/readyz`, graceful shutdown, TTL sweeping, capacity alerts, and incident rollback.
- [ ] Confirm validation export, Mock rendering, source maps containing secrets, and development flags are absent/disabled.

## Acceptance

- [ ] Run clean install/build and deterministic Mock-only CI first.
- [ ] With separate authorization, run one bounded online acceptance per enabled Provider; record calls, cost, and deletion evidence without committing inputs/outputs/secrets.
- [ ] Verify Compile remains available when all Generate transports are disabled and when every Host quota is exhausted.
- [ ] Verify ordinary errors show a safe explanation; technical details show only code, request ID, and limit reason.
- [ ] Do not merge, publish npm, create a Release/tag, edit repository About, or announce a public URL without separate authorization.
