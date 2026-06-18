---
name: Reconciling a diverged GitHub remote
description: Why agent/task routes can't make an external remote commit an ancestor of main, and the user-driven force-push fix.
---

# Reconciling a diverged GitHub remote (origin/main ahead with a commit local lacks)

When `origin/main` (GitHub) holds a commit local `main` does not (Git pane shows
"pulling will start a merge with conflicts" + "can't push: unpulled changes must
be merged first", e.g. `1↓ 42↑`), the agent CANNOT fix the git *history* through
its normal routes:

- **Main agent is system-blocked** from all destructive git (`merge`, `commit`,
  `reset`, `rebase`, `push`, etc.): the bash guard returns "Destructive git
  operations are not allowed in the main agent."
- **Background task agents flatten merges.** A task agent can `git merge
  origin/main` and resolve conflicts, but when the platform merges the task back
  it *rebases* the work onto main, dropping the merge commit's second parent. So
  `origin/main`'s commit never becomes an ancestor of `main` — even though all its
  *content* lands. Result: the Git pane still shows `1↓` and still blocks push.
- **Task envs can't push to GitHub** (no creds — see github-push-from-task-env).

So after a task "reconcile," verify ancestry, not just files:
`git merge-base --is-ancestor <origin-sha> main` will say NO while the content is
present. That mismatch is exactly what keeps the Git pane stuck.

**The fix (when local main is a content superset of origin/main):** the user
force-pushes local `main` to GitHub from the **Shell tab** (not the agent):
`git push --force-with-lease origin main`. This is safe because local already
contains everything on the remote (verify first with
`git diff --diff-filter=A --name-only main origin/main` returning no code files).
The standalone remote commit node disappears but its code stays.

**Why:** the platform's main branch is maintained by rebase/flatten and never
carries a merge commit pointing at an external remote, so the only way the remote
and local can share ancestry is to overwrite the remote from local.

**How to apply:** don't keep proposing tasks to "merge origin/main" — it will
re-flatten every time. Confirm local is a superset, then hand the force-push to
the user via the Shell (the agent and task agents both cannot do it).

## Gotcha: pushing `.github/workflows/*` fails without `workflow` scope

If the pushed history adds/changes any file under `.github/workflows/`, GitHub
rejects with: "refusing to allow an OAuth App to create or update workflow
`.github/workflows/<f>.yml` without `workflow` scope." The **Replit↔GitHub OAuth
connection does NOT carry the `workflow` scope, and disconnect+reconnect on
Replit does not add it** (re-authorizes with the same scopes). So the fix is NOT
reconnecting.

Working fixes (user runs in the Shell — agent is git-blocked):
- **Keep the workflow file:** push with a GitHub **Personal Access Token** that
  has `repo` + `workflow` scopes (classic token). e.g.
  `git push --force-with-lease https://<TOKEN>@github.com/<owner>/<repo>.git main`.
  Never let the token touch chat/commits.
- **Drop CI instead:** remove `.github/workflows/*` from the pushed history, then
  the existing OAuth connection can push. (History rewrite; defeats the purpose
  if the workflow was added intentionally.)

## Gotcha: pulling a botched external merge = "kept both sides" duplicates

When work is merged on GitHub (outside the Replit env) against this platform
branch and the conflicts are resolved by *accepting both sides*, a later
fast-forward `git pull` into the workspace brings in code that compiles-broken:
duplicate import identifiers (TS2300) and `IStorage` method declarations silently
dropped while the `storage/*` module implementations remain (so calls fail TS2339
"does not exist on type IStorage" even though `...xStorage` is spread into the
`storage` object and casts `as IStorage`).

**How to apply:** after such a pull, run `npm run check` and fix mechanically:
(1) de-duplicate the doubled import blocks; (2) for every "does not exist on type
IStorage", re-add the missing method signature to the `IStorage` interface in
`server/storage.ts`, copying the real signature from the `server/storage/<mod>.ts`
implementation (convert default params like `= {}`/`= 50` to optional `?`). The
implementations are intact; only the interface contract is lost. Verify with
`npm run check` + `npm run test` + a workflow restart.
