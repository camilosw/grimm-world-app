---
name: dev-worktree
description: Workflow for every feature or fix the user asks for in grimm-world — start a git worktree off local main, run a Vite dev server for it on a free port and give the user its URL, then after the approved commit land it on main, stop that dev server and remove the worktree. Use whenever the user asks for a feature, fix, change or improvement to the app.
---

# Feature / fix in a worktree with its own dev server

Every feature or fix gets its own worktree and its own dev server, so the user
can watch the result in a browser while main stays untouched. Paths below use
`$ROOT` for the main checkout, `/home/user/projects/grimm-world`.

## 1. Start the worktree

Pick a short kebab-case `<name>` for the change (e.g. `hand-face-up`). Branch
from **local** `main` (not `origin/main`, which may be behind), then switch the
session into it:

```bash
cd $ROOT && git worktree add -b <name> .claude/worktrees/<name> main
```

Then call `EnterWorktree` with `path: "$ROOT/.claude/worktrees/<name>"`.
(Don't use `EnterWorktree` with `name`: it branches from `origin/main`.)

If `git status` in the main checkout shows uncommitted changes, tell the user
they are not in the worktree.

The worktree lacks the git-ignored dependencies and generated assets; link
them to the main checkout's:

```bash
cd $ROOT/.claude/worktrees/<name>
ln -s ../../../node_modules node_modules
for d in cards rules booklets; do ln -s ../../../../public/$d public/$d; done
ln -s ../../../../.husky/_ .husky/_
```

The last link gives the worktree Husky's git hooks (`core.hooksPath` is
`.husky/_`, git-ignored, so without it git runs no hooks there); they run the
worktree's own `.husky/` scripts.

`.gitignore`'s `public/cards/` matches directories only, not these symlinks;
the repo's shared `.git/info/exclude` lists `/public/cards`, `/public/rules`,
`/public/booklets` and `/.husky/_` so they don't show as untracked. If `git status` shows
them anyway, add those lines there.

## 2. Start its dev server and give the user the URL

Find the first free port from 5174 up (5173 is usually the main checkout's
server, and other worktrees may hold the next ones):

```bash
port=5174; while ss -ltn | grep -q ":$port "; do port=$((port+1)); done; echo $port
```

Start Vite in the worktree with the Bash tool's `run_in_background: true`
(remember the task id and the port):

```bash
cd $ROOT/.claude/worktrees/<name> && npm run dev -- --host --port <port> --strictPort
```

Once its output shows `ready`, tell the user right away, before starting on the
code:

> Dev server for `<name>`: http://localhost:<port>/ (tablet: the `Network:` URL Vite printed)

Vite hot-reloads as you edit, so the URL keeps showing the current state.
Note: localStorage is per port, so the table starts from the initial setup on a
new port (unless that port was used before).

## 3. Do the work

Work and verify in the worktree as usual (CLAUDE.md: `npm run typecheck`,
`npm run lint`, `npm run test:run`, `playwright-cli` against `http://localhost:<port>/`). When done,
summarise the change, remind the user of the URL, and **leave it uncommitted**:
never commit without the user's approval.

## 4. After the user approves the commit

1. In the worktree: commit with a Conventional Commits message
   (commitlint checks it; the pre-commit hook runs lint and the Prettier check).
2. Stop the dev server: `TaskStop` with its task id. If the id is unknown
   (e.g. a new session), `fuser -k <port>/tcp`. Confirm the port is free with
   `ss -ltn | grep ":<port> "` (no output).
3. Land it on main, keeping history linear (no merge commits, no lasting
   branches):

   ```bash
   cd $ROOT/.claude/worktrees/<name> && git rebase main   # only if main moved on
   cd $ROOT && git merge --ff-only <name>
   ```

   If the rebase conflicts, or the fast-forward is refused because of
   uncommitted changes in the main checkout, stop and ask the user.

4. Leave and remove the worktree: `ExitWorktree` with `action: "keep"` (it
   won't remove a worktree entered by path), then

   ```bash
   cd $ROOT && git worktree remove .claude/worktrees/<name> && git branch -d <name>
   ```

5. Tell the user the commit is on main and the dev server on `<port>` is stopped.

If the user abandons the change instead, stop the dev server the same way and
ask before removing the worktree (`git worktree remove --force` discards the
changes).
