"""Continue autopilot: auto-accepts Continue (VS Code extension) approval prompts.

Talks to VS Code over the Chrome DevTools Protocol, finds the Continue webview,
and clicks its accept buttons after a short veto window. Standard library only.

VS Code must be started with a debug port (close every VS Code window first):
    "%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe" --remote-debugging-port=9222

Usage:
    python continue_autopilot.py                 # run the autopilot
    python continue_autopilot.py --delay 3       # longer veto window
    python continue_autopilot.py --list-targets  # show what the debug port exposes
    python continue_autopilot.py --dump          # list every button in the Continue webview

Keys while running:
    space  pause / resume auto mode (during a countdown: veto this prompt and pause)
    a      approve the pending prompt now
    q      quit
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import socket
import struct
import sys
import time
import urllib.request
from collections import deque
from datetime import datetime
from urllib.parse import urlparse

try:
    import msvcrt
except ImportError:  # non-Windows: runs without keyboard control
    msvcrt = None

# --- Detection settings --------------------------------------------------------

# CSS selectors tried first; any visible match counts as an accept button.
ACCEPT_SELECTORS = [
    '[data-testid="accept-tool-call-button"]',
]
# Fallback: visible <button> whose text starts with one of these words...
ACCEPT_TEXT = r"^(accept|allow|run)\b"
# ...and that has one of these buttons near it (approval prompts come as a pair;
# this keeps "Run" buttons on chat code blocks from being clicked).
REJECT_TEXT = r"^(reject|cancel|deny|skip|decline)\b"
# A Continue webview target has one of these in its URL.
TARGET_URL_HINTS = ("extensionid=continue.continue", "continue.continue")
# Prompts whose surrounding text matches any of these always pause auto mode.
DANGEROUS = [
    r"\brm\s+-\w*[rf]", r"\brmdir\b", r"\bdel\s", r"remove-item", r"\bformat\s+[a-z]:",
    r"git\s+push", r"git\s+reset\s+--hard", r"git\s+clean", r"git\s+checkout\s+--",
    r"\bdrop\s+(table|database|schema)\b", r"\btruncate\b", r"\bshutdown\b", r"\bmkfs\b",
    r"curl[^|]*\|\s*(ba)?sh", r"iwr[^|]*\|\s*iex", r"--force\b", r"\b(npm|cargo)\s+publish\b",
]

SCAN_JS = r"""
(() => {
  const SELECTORS = %SELECTORS%;
  const TEXT = new RegExp(%TEXT%, 'i');
  const REJECT = new RegExp(%REJECT%, 'i');
  const docs = (d) => {
    const out = [d];
    for (const f of d.querySelectorAll('iframe')) {
      try { if (f.contentDocument) out.push(...docs(f.contentDocument)); } catch (e) {}
    }
    return out;
  };
  const visible = (b) => !b.disabled && b.getClientRects().length > 0;
  const label = (b) => (b.innerText || b.textContent || '').trim();
  const bySelector = (b) => SELECTORS.some((s) => b.matches(s));
  const acceptLike = (b) => bySelector(b) || (label(b).length < 40 && TEXT.test(label(b)));
  const others = (el, b) =>
    [...el.querySelectorAll('button,[role=button]')].filter((o) => o !== b && visible(o));
  // The prompt block of b: its largest ancestor (up to 8 levels) holding no other accept button.
  const block = (b) => {
    let el = b;
    for (let i = 0; i < 8 && el.parentElement && el.parentElement.tagName !== 'BODY'; i++) {
      if (others(el.parentElement, b).some(acceptLike)) break;
      el = el.parentElement;
    }
    return el;
  };
  const res = [];
  for (const d of docs(document)) {
    for (const b of d.querySelectorAll(['button', '[role=button]', ...SELECTORS].join(','))) {
      if (!visible(b) || !acceptLike(b)) continue;
      const blk = block(b);
      if (!bySelector(b) && !others(blk, b).some((o) => REJECT.test(label(o)))) continue;
      let k = b.getAttribute('data-autopilot-key');
      if (!k) { k = Math.random().toString(36).slice(2, 10); b.setAttribute('data-autopilot-key', k); }
      const ctx = (blk.innerText || '').trim();
      res.push({ key: k, label: label(b).split('\n')[0], context: ctx.slice(-600) });
    }
  }
  return res;
})()
"""

CLICK_JS = r"""
(() => {
  const docs = (d) => {
    const out = [d];
    for (const f of d.querySelectorAll('iframe')) {
      try { if (f.contentDocument) out.push(...docs(f.contentDocument)); } catch (e) {}
    }
    return out;
  };
  for (const d of docs(document)) {
    const b = d.querySelector('[data-autopilot-key="%KEY%"]');
    if (b && !b.disabled && b.getClientRects().length > 0) { b.click(); return true; }
  }
  return false;
})()
"""

DUMP_JS = r"""
(() => {
  const docs = (d) => {
    const out = [d];
    for (const f of d.querySelectorAll('iframe')) {
      try { if (f.contentDocument) out.push(...docs(f.contentDocument)); } catch (e) {}
    }
    return out;
  };
  const res = [];
  for (const d of docs(document)) {
    d.querySelectorAll('button,[role=button]').forEach((b) => res.push({
      text: (b.innerText || b.textContent || '').trim().slice(0, 60),
      testid: b.getAttribute('data-testid'),
      title: b.getAttribute('title'),
      visible: b.getClientRects().length > 0,
    }));
  }
  return res;
})()
"""


# --- Minimal websocket + CDP client -------------------------------------------

class WebSocket:
    """Just enough RFC 6455 for CDP: text frames, ping/pong, close."""

    def __init__(self, url: str, timeout: float = 5.0):
        u = urlparse(url)
        self.sock = socket.create_connection((u.hostname, u.port or 80), timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        path = u.path + (f"?{u.query}" if u.query else "")
        self.sock.sendall(
            f"GET {path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\n"
            f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode()
        )
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("handshake closed")
            resp += chunk
        head, self.buf = resp.split(b"\r\n\r\n", 1)
        if b" 101 " not in head.split(b"\r\n", 1)[0]:
            raise ConnectionError(head.split(b"\r\n", 1)[0].decode(errors="replace"))

    def _exact(self, n: int) -> bytes:
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("socket closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _frame(self, opcode: int, payload: bytes) -> None:
        n = len(payload)
        head = bytes([0x80 | opcode])
        if n < 126:
            head += bytes([0x80 | n])
        elif n < 65536:
            head += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            head += bytes([0x80 | 127]) + struct.pack(">Q", n)
        mask = os.urandom(4)
        body = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(head + mask + body)

    def send(self, text: str) -> None:
        self._frame(0x1, text.encode())

    def recv(self) -> str:
        msg = b""
        while True:
            b1, b2 = self._exact(2)
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._exact(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._exact(8))[0]
            mask = self._exact(4) if b2 & 0x80 else None
            data = self._exact(n)
            if mask:
                data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
            op = b1 & 0x0F
            if op == 0x8:
                raise ConnectionError("closed by peer")
            if op == 0x9:
                self._frame(0xA, data)
                continue
            if op == 0xA:
                continue
            msg += data
            if b1 & 0x80:
                return msg.decode(errors="replace")

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass


class CDP:
    def __init__(self, ws_url: str):
        self.ws = WebSocket(ws_url)
        self.next_id = 0

    def evaluate(self, expression: str):
        self.next_id += 1
        mid = self.next_id
        self.ws.send(json.dumps({
            "id": mid, "method": "Runtime.evaluate",
            "params": {"expression": expression, "returnByValue": True},
        }))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") != mid:
                continue  # stray event
            if "error" in msg:
                raise RuntimeError(msg["error"].get("message"))
            result = msg["result"]
            if "exceptionDetails" in result:
                raise RuntimeError(result["exceptionDetails"].get("text", "JS exception"))
            return result["result"].get("value")

    def close(self) -> None:
        self.ws.close()


def list_targets(port: int) -> list[dict]:
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2) as r:
        return json.load(r)


def continue_targets(port: int) -> list[dict]:
    return [
        t for t in list_targets(port)
        if t.get("webSocketDebuggerUrl")
        and any(h in t.get("url", "").lower() for h in TARGET_URL_HINTS)
    ]


# --- Autopilot -----------------------------------------------------------------

class Autopilot:
    def __init__(self, port: int, delay: float):
        self.port = port
        self.delay = delay
        self.auto = True
        self.conns: dict[str, CDP] = {}
        self.skipped: set[str] = set()  # prompt keys vetoed or paused on
        self.log: deque[str] = deque(maxlen=12)
        self.status = "starting"
        self.last_refresh = 0.0
        self.last_screen = ""
        self.dangerous = [re.compile(p, re.I) for p in DANGEROUS]
        self.scan_js = (SCAN_JS
                        .replace("%SELECTORS%", json.dumps(ACCEPT_SELECTORS))
                        .replace("%TEXT%", json.dumps(ACCEPT_TEXT))
                        .replace("%REJECT%", json.dumps(REJECT_TEXT)))

    def note(self, text: str) -> None:
        self.log.append(f"{datetime.now():%H:%M:%S}  {text}")

    def refresh(self) -> None:
        self.last_refresh = time.monotonic()
        try:
            targets = continue_targets(self.port)
        except OSError:
            self.drop_all()
            self.status = f"no debug port on 127.0.0.1:{self.port} (start VS Code with --remote-debugging-port={self.port})"
            return
        ids = {t["id"] for t in targets}
        for tid in list(self.conns):
            if tid not in ids:
                self.conns.pop(tid).close()
        for t in targets:
            if t["id"] not in self.conns:
                try:
                    self.conns[t["id"]] = CDP(t["webSocketDebuggerUrl"])
                    self.note(f"attached to Continue webview {t['id'][:8]}")
                except (OSError, ConnectionError) as e:
                    self.note(f"attach failed: {e}")
        self.status = (f"watching {len(self.conns)} Continue webview(s)" if self.conns
                       else "connected; Continue webview not found (open the Continue panel)")

    def drop_all(self) -> None:
        for c in self.conns.values():
            c.close()
        self.conns.clear()

    def scan(self) -> list[tuple[str, dict]]:
        found = []
        for tid, conn in list(self.conns.items()):
            try:
                for item in conn.evaluate(self.scan_js) or []:
                    found.append((tid, item))
            except (OSError, ConnectionError, RuntimeError, ValueError) as e:
                self.conns.pop(tid).close()
                self.note(f"lost webview {tid[:8]}: {e}")
        return found

    def click(self, tid: str, item: dict) -> None:
        conn = self.conns.get(tid)
        try:
            ok = bool(conn and conn.evaluate(CLICK_JS.replace("%KEY%", item["key"])))
        except (OSError, ConnectionError, RuntimeError, ValueError) as e:
            ok = False
            self.note(f"click error: {e}")
        self.note(f"{'approved' if ok else 'gone before click'}: {summary(item)}")

    def is_dangerous(self, item: dict) -> str | None:
        for rx in self.dangerous:
            m = rx.search(item.get("context", ""))
            if m:
                return m.group(0)
        return None

    # -- screen --

    def render(self, pending: dict | None = None, countdown: float | None = None) -> None:
        mode = "\x1b[42;30m AUTO \x1b[0m" if self.auto else "\x1b[43;30m PAUSED \x1b[0m"
        lines = [
            f"Continue autopilot  {mode}  delay {self.delay:.1f}s  port {self.port}",
            f"  {self.status}",
            "  [space] pause/resume or veto   [a] approve now   [q] quit",
            "",
        ]
        if pending:
            head = f"\x1b[1mPENDING\x1b[0m  {pending.get('label', '?')}"
            if countdown is not None:
                head += f"   approving in \x1b[1m{countdown:.1f}s\x1b[0m  (space to veto)"
            lines.append(head)
            for ln in pending.get("context", "").splitlines()[-8:]:
                lines.append("  | " + ln[:110])
            lines.append("")
        lines.append("Log:")
        lines.extend("  " + entry for entry in self.log)
        screen = "\n".join(lines)
        if screen != self.last_screen:
            self.last_screen = screen
            sys.stdout.write("\x1b[H\x1b[2J" + screen + "\n")
            sys.stdout.flush()

    # -- loop --

    def run(self) -> None:
        os.system("")  # enables ANSI escapes in the Windows console
        if msvcrt is None:
            self.note("no msvcrt: keyboard control disabled (Windows only)")
        while True:
            if not self.conns or time.monotonic() - self.last_refresh > 3:
                self.refresh()
            items = [(t, i) for t, i in self.scan() if i["key"] not in self.skipped]
            current = items[0] if items else None
            if current and self.auto:
                self.handle(*current)
                continue
            self.render(current[1] if current else None)
            key = read_key()
            if key == "q":
                return
            if key == " ":
                self.auto = not self.auto
                self.note("auto mode on" if self.auto else "paused")
            elif key == "a":
                pending = current or self.first_skipped()
                if pending:
                    self.click(*pending)
            time.sleep(0.4)

    def first_skipped(self) -> tuple[str, dict] | None:
        for tid, item in self.scan():
            if item["key"] in self.skipped:
                return tid, item
        return None

    def handle(self, tid: str, item: dict) -> None:
        danger = self.is_dangerous(item)
        if danger:
            self.auto = False
            self.skipped.add(item["key"])
            self.note(f"PAUSED on dangerous pattern '{danger}': {summary(item)}")
            sys.stdout.write("\a")
            return
        deadline = time.monotonic() + self.delay
        while (left := deadline - time.monotonic()) > 0:
            self.render(item, countdown=left)
            key = read_key()
            if key == " ":
                self.auto = False
                self.skipped.add(item["key"])
                self.note(f"vetoed, paused: {summary(item)}")
                return
            if key == "q":
                raise KeyboardInterrupt
            if key == "a":
                break
            time.sleep(0.05)
        self.click(tid, item)


def summary(item: dict) -> str:
    ctx = " ".join(item.get("context", "").split())
    return f"[{item.get('label', '?')}] {ctx[-70:]}"


def read_key() -> str | None:
    if msvcrt is None or not msvcrt.kbhit():
        return None
    ch = msvcrt.getwch()
    if ch in ("\x00", "\xe0"):  # arrow/function keys send a second code
        msvcrt.getwch()
        return None
    return ch.lower()


def main() -> None:
    ap = argparse.ArgumentParser(description="Auto-accept Continue approval prompts with a veto window.")
    ap.add_argument("--port", type=int, default=9222, help="VS Code remote debugging port (default 9222)")
    ap.add_argument("--delay", type=float, default=2.0, help="veto window in seconds (default 2)")
    ap.add_argument("--list-targets", action="store_true", help="print debug targets and exit")
    ap.add_argument("--dump", action="store_true", help="print buttons in the Continue webview and exit")
    args = ap.parse_args()

    if args.list_targets:
        for t in list_targets(args.port):
            print(f"{t.get('type', '?'):8} {t.get('title', '')[:40]:40} {t.get('url', '')[:120]}")
        return
    if args.dump:
        targets = continue_targets(args.port)
        if not targets:
            print("No Continue webview found. Open the Continue panel, or check --list-targets.")
        for t in targets:
            conn = CDP(t["webSocketDebuggerUrl"])
            print(f"== {t['id']}  {t.get('url', '')[:100]}")
            for b in conn.evaluate(DUMP_JS) or []:
                print(f"  {'V' if b['visible'] else ' '} text={b['text']!r} testid={b['testid']!r} title={b['title']!r}")
            conn.close()
        return

    pilot = Autopilot(args.port, args.delay)
    try:
        pilot.run()
    except KeyboardInterrupt:
        pass
    finally:
        pilot.drop_all()
        print("\nautopilot stopped")


if __name__ == "__main__":
    main()
