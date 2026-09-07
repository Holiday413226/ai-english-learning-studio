"""Admin CLI for generating, revoking, and inspecting activation codes.

Run from within ``gateway/``::

    python manage_codes.py create --count 10 --expires 30d --daily-limit 200
    python manage_codes.py list
    python manage_codes.py revoke AIES-XXXX-XXXX-XXXX-XXXX
    python manage_codes.py stats
"""

import argparse
import sys
from datetime import datetime, timedelta

from auth import create_codes, revoke, list_codes, stats


def parse_expiry(value: str) -> str | None:
    """Parse ``never`` | ``<N>d`` | ``<N>m`` | ``<N>y`` | ISO datetime → ISO string."""
    value = (value or "").strip().lower()
    if not value or value == "never":
        return None
    if value[-1] in ("d", "m", "y") and value[:-1].isdigit():
        n = int(value[:-1])
        delta = {"d": timedelta(days=n), "m": timedelta(days=30 * n), "y": timedelta(days=365 * n)}[value[-1]]
        return (datetime.now() + delta).isoformat()
    # Assume an ISO date/datetime string
    try:
        return datetime.fromisoformat(value).isoformat()
    except ValueError:
        raise SystemExit(f"无法解析 --expires 值：{value}（支持 never / 30d / 1y / ISO 日期）")


def main() -> int:
    p = argparse.ArgumentParser(description="管理 AI English Learning Studio 激活码")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("create", help="生成激活码")
    c.add_argument("--count", type=int, default=1)
    c.add_argument("--expires", default="never", help="never / 30d / 1y / ISO 日期")
    c.add_argument("--daily-limit", type=int, default=0, help="每日调用上限（0=不限）")
    c.add_argument("--total-limit", type=int, default=0, help="总调用上限（0=不限）")

    sub.add_parser("list", help="列出所有激活码")
    r = sub.add_parser("revoke", help="吊销激活码")
    r.add_argument("code")
    sub.add_parser("stats", help="汇总统计")

    args = p.parse_args()

    if args.cmd == "create":
        codes = create_codes(
            count=args.count,
            expires_at=parse_expiry(args.expires),
            daily_limit=args.daily_limit,
            total_limit=args.total_limit,
        )
        print(f"已生成 {len(codes)} 个激活码：")
        for code in codes:
            print(f"  {code}")

    elif args.cmd == "list":
        rows = list_codes()
        if not rows:
            print("（无激活码）")
            return 0
        for r in rows:
            state = "有效" if r["active"] else "已吊销"
            print(
                f"{r['code']}  {state}  已用 {r['used_total']} 次  "
                f"到期 {r['expires_at'] or '永不过期'}"
            )

    elif args.cmd == "revoke":
        if revoke(args.code):
            print(f"已吊销：{args.code}")
        else:
            print(f"未找到激活码：{args.code}")
            return 1

    elif args.cmd == "stats":
        s = stats()
        print(f"总数 {s['total']}  有效 {s['active']}  累计调用 {s['total_calls']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
