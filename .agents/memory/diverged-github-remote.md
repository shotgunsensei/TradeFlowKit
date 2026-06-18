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
