# BookAI RC Final Rollback

## Application rollback

Use the last QA-validated application revision. Do not use destructive Git reset or clean commands.

## Render Staging rollback

Rollback only the existing Staging service to a previously validated deployment. Do not modify Production.

## Database policy

Do not perform destructive database rollback, DROP, TRUNCATE or data deletion. Any Migration handling requires explicit Boss authorization and an isolated backup/restore plan.
