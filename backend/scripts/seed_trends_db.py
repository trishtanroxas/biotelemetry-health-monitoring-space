from backend.app.core.supabase_client import get_supabase
from backend.app.services.trend_seed import seed_supabase_trends


def main() -> None:
    supabase = get_supabase()
    if not supabase:
        raise SystemExit("Supabase client is not configured; check SUPABASE_URL and SUPABASE_KEY in .env.")
    summary = seed_supabase_trends(supabase)
    print("Seeded trends to Supabase:", summary)


if __name__ == "__main__":
    main()
