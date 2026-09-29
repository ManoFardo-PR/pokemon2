"""
Cost and outcome metrics per task, read from modules/logs/live.log.

    python modules/metrics.py                 # every task attempt in the live log
    python modules/metrics.py --task S02T01   # one task
    python modules/metrics.py --json          # machine-readable
    python modules/metrics.py --log path/to/live.log

One row per TASK_START..TASK_END pair: LLM calls, characters sent and received,
tokens when the direct API reported them (LLM_TRACE "gemini direto" lines),
seconds waiting on the model, rework rounds and gate verdicts per stage, files
written, outcome. The header format is the one reporter.py writes:
    ==== HH:MM:SS | TASK | KIND | title | k=v k=v ====
"""
import argparse
import json
import os
import re
import sys
from typing import Any, Dict, List, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

MODULES_DIR = os.path.dirname(os.path.abspath(__file__))
HEADER_RE = re.compile(r"^==== (\d\d:\d\d:\d\d) \| ([^|]+?) \| ([A-Z_]+) \| (.*?)(?: \| ([^|]*?))? ====$")
META_RE = re.compile(r"(\w+)=([^\s]+)")
USAGE_RE = re.compile(r"entrada=(\d+) saída=(\d+) pensamento=(\d+)")
STAGE_RE = re.compile(r"fase (\d) rodada (\d+): (CORRECT|REWORK)")
FILL = "-"


def parse_headers(path: str, body_chars: int = 400) -> List[Dict[str, Any]]:
    """Header events with the first `body_chars` of their body (the direct-API usage line lives there)."""
    events: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for raw in f:
            line = raw.rstrip("\n")
            m = HEADER_RE.match(line)
            if m:
                ts, task, kind, title, meta = m.groups()
                current = {"ts": ts, "task": task.strip(), "kind": kind, "title": title,
                           "meta": dict(META_RE.findall(meta or "")), "body": ""}
                events.append(current)
            elif line.startswith("==== END "):
                current = None
            elif current is not None and len(current["body"]) < body_chars:
                current["body"] += line[: body_chars - len(current["body"])] + " "
    return events


def _secs(ts: str) -> int:
    h, m, s = ts.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def summarize(events: List[Dict[str, Any]], only_task: Optional[str] = None) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None
    for ev in events:
        if ev["kind"] == "TASK_START":
            cur = {"task": ev["task"], "start": ev["ts"], "end": None, "outcome": "interrupted",
                   "calls": 0, "chars_sent": 0, "chars_received": 0, "wait_s": 0.0,
                   "prompt_tokens": 0, "output_tokens": 0, "thinking_tokens": 0, "direct_requests": 0,
                   "rework": {}, "gates": [], "files_written": 0, "rejects": 0}
            rows.append(cur)
            continue
        if cur is None or ev["task"] != cur["task"]:
            continue
        kind, meta = ev["kind"], ev["meta"]
        if kind == "LLM_PROMPT":
            cur["calls"] += 1
            cur["chars_sent"] += int(meta.get("chars", 0))
        elif kind == "LLM_RESPONSE":
            cur["chars_received"] += int(meta.get("chars", 0))
            cur["wait_s"] += float(str(meta.get("elapsed", "0")).rstrip("s") or 0)
        elif kind == "LLM_TRACE":
            # usage text may sit in the title, the meta column or the body, depending on the emitter
            blob = " ".join([ev["title"], ev.get("body", ""), " ".join(f"{k}={v}" for k, v in meta.items())])
            u = USAGE_RE.search(blob)
            if u:
                cur["direct_requests"] += 1
                cur["prompt_tokens"] += int(u.group(1))
                cur["output_tokens"] += int(u.group(2))
                cur["thinking_tokens"] += int(u.group(3))
        elif kind == "GATE":
            m = STAGE_RE.search(ev["title"])
            if m:
                stage, rnd, verdict = m.group(1), int(m.group(2)), m.group(3)
                cur["rework"][stage] = max(cur["rework"].get(stage, 0), rnd - 1)
                cur["gates"].append(f"S{stage}r{rnd}:{verdict[0]}")
        elif kind == "FILE_WRITE":
            cur["files_written"] += 1
        elif kind == "FILE_REJECT":
            cur["rejects"] += 1
        elif kind == "TASK_END":
            cur["end"] = ev["ts"]
            cur["outcome"] = "done" if "CONCLU" in ev["title"] else ("failed" if "FALHOU" in ev["title"] else "ended")
            cur["elapsed_s"] = int(str(meta.get("elapsed", "0")).rstrip("s") or 0) or (_secs(ev["ts"]) - _secs(cur["start"]))
            cur = None
    for r in rows:
        r.setdefault("elapsed_s", 0)
    if only_task:
        rows = [r for r in rows if r["task"].upper() == only_task.upper()]
    return rows


def render(rows: List[Dict[str, Any]]) -> str:
    if not rows:
        return "(no task attempts found)"
    head = f"{'task':8} {'start':8} {'end':8} {'outcome':11} {'calls':>5} {'sent K':>7} {'recv K':>7} {'wait s':>7} {'req':>4} {'ptok K':>7} {'otok K':>6} {'think K':>7} {'rework':10} {'files':>5} {'rej':>3}"
    lines = [head, "-" * len(head)]
    for r in rows:
        rework = " ".join(f"S{k}:{v}" for k, v in sorted(r["rework"].items())) or FILL
        lines.append(f"{r['task']:8} {r['start']:8} {(r['end'] or FILL):8} {r['outcome']:11} {r['calls']:5d} "
                     f"{r['chars_sent']/1000:7.1f} {r['chars_received']/1000:7.1f} {r['wait_s']:7.0f} "
                     f"{r['direct_requests']:4d} {r['prompt_tokens']/1000:7.1f} {r['output_tokens']/1000:6.1f} "
                     f"{r['thinking_tokens']/1000:7.1f} {rework:10} {r['files_written']:5d} {r['rejects']:3d}")
    tot_calls = sum(r["calls"] for r in rows)
    tot_sent = sum(r["chars_sent"] for r in rows)
    tot_ptok = sum(r["prompt_tokens"] for r in rows)
    lines.append("-" * len(head))
    lines.append(f"{len(rows)} attempt(s): {tot_calls} calls, {tot_sent/1000:.0f} K chars sent, "
                 f"{tot_ptok/1000:.0f} K prompt tokens measured by the direct API "
                 f"(CLI-mode calls report no token usage here; see ~/.continue/logs/cn*.log).")
    return "\n".join(lines)


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--log", default=os.path.join(MODULES_DIR, "logs", "live.log"))
    ap.add_argument("--task", default=None)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    if not os.path.exists(args.log):
        print(f"live log not found: {args.log}")
        return 1
    rows = summarize(parse_headers(args.log), args.task)
    print(json.dumps(rows, ensure_ascii=False, indent=2) if args.json else render(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
