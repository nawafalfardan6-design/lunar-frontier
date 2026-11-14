# How our team works on Lunar Frontier

This guide explains how anyone on the team can work on the game from **any laptop**,
use Codex without stepping on each other, and get changes onto the live site.

## 1. One-time setup on each laptop

1. **Make sure you can push to the repo.** The repo owner adds each teammate under
   GitHub → repo → Settings → Collaborators. Accept the email invite.
2. **Install Git** (https://git-scm.com) and sign in to GitHub. The easiest options are
   [GitHub Desktop](https://desktop.github.com), or the GitHub CLI and `gh auth login`.
3. **Clone the project:**
   ```bash
   git clone https://github.com/nawafalfardan6-design/lunar-frontier.git
   cd lunar-frontier
   ```
4. **Tell Git who you are**, using *your own* GitHub name and email, so your work is
   credited to you on GitHub:
   ```bash
   git config user.name "Your Name"
   git config user.email "you@example.com"   # the email on your GitHub account
   ```
   GitHub only credits a commit to you if this email is on your account.
5. **Run the game:**
   ```bash
   python3 -m http.server 8765 --directory dist
   ```
   Then open http://localhost:8765. The simple 2D version is at http://localhost:8765/mission.html.

## 2. Using Codex (or any AI assistant)

- **Everyone uses their own ChatGPT account.** Codex usage limits belong to each
  account, not to the laptop. If one person runs out, someone else keeps going on
  their own laptop, and nothing is lost because the code lives on GitHub.
- There are two ways to use Codex:
  - **Codex on the web** (chatgpt.com/codex): connect your GitHub account, pick the
    `lunar-frontier` repo and describe the change. Codex makes a branch or pull
    request. Check it, then merge it on GitHub.
  - **Codex in your terminal or VS Code**, inside your cloned folder. It edits your
    local files, then you test, commit and push yourself.
- Codex automatically reads [`AGENTS.md`](AGENTS.md), which holds the project rules.
  Keep it up to date when you change how the project is organized.
- **Good prompts are small and specific.** Name the file and describe what you
  want to *see* when you play:
  > In `dist/controls.js`, make the jump a little higher. The player should rise about
  > 1 metre and come down slowly like on the Moon. Don't change anything else.
- **One prompt, one change.** Before you push, play the game and check that it still works.
- **Don't run two AI tasks on the same file at the same time**, even on two laptops.

## 3. Daily workflow

```bash
git pull --rebase            # 1. always get everyone's latest work first
# 2. make your change (yourself or with Codex)
# 3. test it in the browser (and run the logic test if you touched engine.js)
node tests/engine.test.js
git add -A
git commit -m "Make the jump floatier"
git pull --rebase            # 4. grab anything pushed while you worked
git push                     # 5. then redeploy the site with Codex (see section 5)
```

**Claim your area before you start.** Write it in the team chat, e.g.
"I'm on movement (controls.js)", so two people don't edit the same file.

| Area | Files |
| --- | --- |
| Mission story, choices, scoring | `dist/engine.js` (+ `tests/engine.test.js`) |
| Movement and controls | `dist/controls.js` (touch joystick: `dist/presentation.js`) |
| Screens, dialogs, HUD | `dist/hud.js`, `dist/mission-panels.js`, `dist/hud.css`, `dist/index.html`, `dist/*.css` |
| 3D graphics and lighting | `dist/scene.js`, `dist/surfaces.js` |
| Moon terrain, sky, title Moon | `dist/landscape.js` |
| Spacecraft rooms and stations | `dist/ship.js` |
| Hands-on mini-games | `dist/tasks.js` |
| Nora's hints | `dist/companion.js` |
| VR | `dist/xr.js` |

## 4. When Git says there is a conflict

This means two people changed the same lines. Don't panic:

1. Open the file. Git marks both versions between `<<<<<<<`, `=======` and `>>>>>>>`.
2. Keep the right code from both sides and delete the marker lines.
   You can also ask Codex: *"Resolve the merge conflict in dist/hud.js, keeping both changes."*
3. Test the game, then run `git add <file>` and `git rebase --continue`, then `git push`.

If you get stuck, **don't force-push.** Ask a teammate or your teacher.

## 5. The live site

- The game is published with Codex hosting from the `dist/` folder (settings in
  `.openai/hosting.json`):
  **https://lunar-frontier-mission-nawaf.cleverhornbill2.chatgpt.site/**
- **Pushing to GitHub does not update the site by itself.** To publish, the person
  whose ChatGPT account owns the hosting asks Codex:
  > Pull the latest `main` from GitHub and redeploy the site from `dist/`.
- Only redeploy after the **Check game** workflow on GitHub shows a green ✅ for the
  latest commit (GitHub → Actions tab). A red ❌ means the JavaScript or the mission
  logic test is broken. Open the run to see why, fix it, and push again.

## 6. Before you push: checklist

- [ ] `git pull --rebase` done
- [ ] The game loads with no red errors in the browser console (F12)
- [ ] You can walk, look around, use a terminal and finish a day
- [ ] `node tests/engine.test.js` passes (if you touched game logic)
- [ ] Your commit message says what you changed
