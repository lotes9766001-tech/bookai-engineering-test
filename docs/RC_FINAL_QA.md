# BookAI RC Final QA

## Local gate

Run `npm.cmd run gate:rc`.

Expected: every command exits 0 and the final line is `RC local foundation gate passed`.

Failure: any syntax, smoke, health, build, diff or secret-scan failure is a QA failure; do not deploy.

The local gate uses Fake Pool, Mock/existing isolated SQLite smoke and does not connect PostgreSQL or Render.

## Staging gate

QA must separately use the existing `bookai-rc3-staging` and `bookai-rc3-staging-db` resources. Staging evidence is not implied by local Pass results. Migration handling is read-only unless Boss explicitly authorizes it.
