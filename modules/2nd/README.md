# Continue autopilot

`continue_autopilot.py` watches the Continue extension's panel in VS Code and clicks its approval buttons (terminal commands, URL
fetches, file edits, …) after a short veto window, so a long agent run doesn't stall waiting for you. It is one file and uses only
the Python standard library.

## How it works

VS Code is an Electron app, so it can expose the Chrome DevTools Protocol (CDP). The script:

1. reads `http://127.0.0.1:<port>/json/list` and keeps the targets whose URL contains `extensionId=Continue.continue` (the Continue
   webview);
2. every ~0.4 s runs a small JavaScript probe in that webview (and its nested iframes) looking for visible approval buttons:
   `[data-testid="accept-tool-call-button"]`, or a button whose text starts with `Accept` / `Allow` / `Run` **and** that sits in the
   same prompt block as a `Reject` / `Cancel` / `Skip` / `Deny` button (so a lone "Run" on a chat code block is never clicked);
3. when one appears, shows the prompt text in the terminal and counts down (`--delay`, default 2 s); if you don't veto, it calls
   `button.click()` in the page.

Prompts whose text matches a dangerous pattern (`rm -rf`, `git push`, `git reset --hard`, `DROP TABLE`, `Remove-Item`, `--force`,
`curl … | sh`, …) are **never** auto-approved: auto mode pauses and the terminal beeps. Checked against the 167 terminal commands
Continue ran on 2026-09-28, only `Remove-Item test_tmp.db -Force` would have paused.

## Setup

1. Close **every** VS Code window. If one is still open, the new launch reuses it and ignores the flag.
2. Start VS Code with the debug port:

   ```powershell
   & "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" --remote-debugging-port=9222
   ```

3. Open the Continue panel (its webview only exists once opened).
4. In another terminal:

   ```powershell
   python modules\2nd\continue_autopilot.py
   ```

## Keys

| Key | Effect |
|---|---|
| `space` | pause / resume auto mode; during a countdown it vetoes that prompt and pauses |
| `a` | approve the pending prompt now (also works on a vetoed prompt while paused) |
| `q` | quit |

A vetoed prompt is never auto-approved later, even after you resume; answer it in VS Code or press `a`.

## Options and calibration

| Flag | Default | Meaning |
|---|---|---|
| `--delay` | `2` | veto window in seconds |
| `--port` | `9222` | debug port VS Code was started with |
| `--list-targets` | | print every CDP target and exit; use it if the Continue webview isn't found |
| `--dump` | | print every button in the Continue webview (text, `data-testid`, visibility) and exit |

Continue's markup changes between versions. If the autopilot never sees a prompt, leave one pending, run `--dump`, and adjust
`ACCEPT_SELECTORS` / `ACCEPT_TEXT` / `REJECT_TEXT` at the top of the script. Edit `DANGEROUS` there to change which commands always
pause.

## Security

While VS Code runs with `--remote-debugging-port`, **any local process** can drive it (and your extensions' secrets). The port binds
to `127.0.0.1` only, but only launch VS Code that way while you use the autopilot. Auto-approving terminal commands proposed by a
model is inherently risky; the dangerous-pattern list is a safety net, not a guarantee.
