---
name: GitHub push from isolated task env
description: Why `git push origin main` to a user's GitHub remote fails inside an isolated task environment, and what to do instead.
---

# Pushing to the user's GitHub remote from a task environment

`git push origin <branch>` to a user's GitHub HTTPS remote fails from inside an
isolated task/subrepl environment with: `remote: Invalid username or token.
Password authentication is not supported for Git operations` /
`fatal: Authentication failed`.

**Why:** the GitHub credentials live in the Replit Git pane integration, which is
not threaded into isolated task environments. Local merge/commit work succeeds;
only the network push to `origin` (GitHub) is blocked.

**How to apply:** for tasks that ask to "sync with GitHub" / "push to origin",
do all the merge + conflict-resolution + commit work locally and verify it
(typecheck, boot, branch ahead/behind). Then report that the actual push must be
done by the user through the Replit Git pane (or it propagates via the platform
after the task merges back). Do not treat the push failure as a task failure —
the reconciliation is the deliverable; the push is a user/platform action.
