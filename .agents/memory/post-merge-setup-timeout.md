---
name: Post-merge setup timeout
description: Why post-merge setup intermittently fails after task merges, and how to keep it green.
---

The platform runs `scripts/post-merge.sh` automatically after a task merge with a hard
~20s timeout. A merge can succeed while post-merge setup still fails with
`SETUP_FAILED ... timed out after 20000ms`.

**Why:** If the script runs anything slow — notably `npm audit` or a full `npm install`
— it easily exceeds the 20s budget (observed ~98s, dominated by audit/network), and the
setup is reported as failed even though nothing is actually broken.

**How to apply:** Keep `scripts/post-merge.sh` fast and offline-cheap. Do not run
`npm audit` in it; avoid full reinstalls when a cache is warm. If post-merge setup
fails purely on a timeout (not a real error), the merge itself is fine — verify the
working tree and restart the workflow rather than treating it as a code problem. See the
`post_merge_setup` skill to edit the script.
