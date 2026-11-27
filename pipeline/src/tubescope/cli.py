"""Command-line entry point: ``uv run tubescope <command>``."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path

from . import config, db, sources
from .youtube import YouTubeClient

log = logging.getLogger("tubescope")


def _cmd_migrate(args: argparse.Namespace) -> dict:
    with db.connect(args.database_url) as conn:
        applied = db.migrate(conn)
        views = db.rebuild_views(conn)
    return {"migrations_applied": applied, "views_built": views}


def _cmd_views(args: argparse.Namespace) -> dict:
    with db.connect(args.database_url) as conn:
        return {"views_built": db.rebuild_views(conn)}


def _cmd_load_kaggle(args: argparse.Namespace) -> dict:
    paths = [Path(p) for p in args.paths] or sorted(config.KAGGLE_DIR.glob("*.csv"))
    if not paths:
        raise SystemExit(f"No Kaggle CSVs found in {config.KAGGLE_DIR}")
    results = {}
    with db.connect(args.database_url) as conn:
        for path in paths:
            results[path.name] = db.load_bundle(conn, sources.kaggle_bundle(path))
    return results


def _cmd_load_snapshots(args: argparse.Namespace) -> dict:
    directory = Path(args.directory)
    paths = sorted(directory.glob("*.csv"))
    bundle = sources.legacy_snapshots_bundle(paths, region=args.region)
    with db.connect(args.database_url) as conn:
        return {"files_found": len(paths), **db.load_bundle(conn, bundle)}


def _cmd_ingest(args: argparse.Namespace) -> dict:
    captured_at = datetime.now(UTC)
    with YouTubeClient(config.youtube_api_key()) as client:
        videos = client.most_popular(args.region, max_videos=args.max_videos)
        channels = client.channels(item["snippet"]["channelId"] for item in videos)
        categories = client.video_categories(args.region)
    if args.raw_dir:
        raw_dir = Path(args.raw_dir)
        raw_dir.mkdir(parents=True, exist_ok=True)
        stamp = captured_at.strftime("%Y-%m-%dT%H-%M-%SZ")
        (raw_dir / f"{args.region}_{stamp}.json").write_text(
            json.dumps(
                {
                    "captured_at": captured_at.isoformat(),
                    "videos": videos,
                    "channels": channels,
                    "categories": categories,
                }
            )
        )
    bundle = sources.api_bundle(
        videos, channels, region=args.region, captured_at=captured_at, chart_size=args.max_videos
    )
    with db.connect(args.database_url) as conn:
        db.upsert_categories(conn, ((int(c["id"]), c["snippet"]["title"]) for c in categories))
        return {"captured_at": captured_at.isoformat(), **db.load_bundle(conn, bundle)}


def _cmd_bootstrap(args: argparse.Namespace) -> dict:
    """Create the schema and load every committed raw file."""
    with db.connect(args.database_url) as conn:
        applied = db.migrate(conn)
        loaded = {}
        for path in sorted(config.KAGGLE_DIR.glob("*.csv")):
            loaded[f"kaggle/{path.name}"] = db.load_bundle(conn, sources.kaggle_bundle(path))
        snapshot_paths = sorted(config.API_SNAPSHOT_DIR.glob("*.csv"))
        if snapshot_paths:
            loaded["api_snapshots"] = db.load_bundle(
                conn, sources.legacy_snapshots_bundle(snapshot_paths)
            )
        views = db.rebuild_views(conn)
    return {"migrations_applied": applied, "loaded": loaded, "views_built": views}


def _cmd_train(args: argparse.Namespace) -> dict:
    from .ml import dataset, registry, train

    with db.connect(args.database_url) as conn:
        data = dataset.labelled(dataset.load_frame(conn, region=args.region, chart_size=200))
        results = {}
        for feature_set in args.feature_set:
            result = train.train(data, feature_set, n_boot=args.bootstrap)
            path = registry.save(result, Path(args.out) if args.out else registry.MODELS_DIR)
            version_id = registry.register(conn, result, path) if args.register else None
            test = result.report["test"]["all_test"]
            results[feature_set] = {
                "name": result.name,
                "model_version_id": version_id,
                "artifact_dir": str(path),
                "estimator": result.report["estimator"],
                "test_roc_auc": round(test["roc_auc"], 4),
                "test_average_precision": round(test["average_precision"], 4),
                "test_brier": round(test["brier"], 4),
            }
    return results


def _cmd_score(args: argparse.Namespace) -> dict:
    from .ml import registry

    with db.connect(args.database_url) as conn:
        version_id, uri = registry.latest_model(conn, args.feature_set)
        counts = registry.score(
            conn, version_id, uri, region=args.region,
            include_training_period=args.include_training_period,
        )  # fmt: skip
    return {"model_version_id": version_id, "artifact_uri": uri, **counts}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tubescope", description=__doc__)
    parser.add_argument("--database-url", default=None, help="defaults to $DATABASE_URL")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("migrate", help="apply migrations and rebuild analytics views").set_defaults(
        func=_cmd_migrate
    )
    sub.add_parser("views", help="rebuild analytics views only").set_defaults(func=_cmd_views)
    sub.add_parser("bootstrap", help="migrate, load all raw data, build views").set_defaults(
        func=_cmd_bootstrap
    )

    kaggle = sub.add_parser("load-kaggle", help="load Kaggle trending CSV export(s)")
    kaggle.add_argument("paths", nargs="*", help=f"defaults to {config.KAGGLE_DIR}/*.csv")
    kaggle.set_defaults(func=_cmd_load_kaggle)

    snaps = sub.add_parser("load-snapshots", help="load legacy pull_trending.py CSV snapshots")
    snaps.add_argument("directory", nargs="?", default=str(config.API_SNAPSHOT_DIR))
    snaps.add_argument("--region", default=config.DEFAULT_REGION)
    snaps.set_defaults(func=_cmd_load_snapshots)

    ingest = sub.add_parser("ingest", help="pull today's chart from the YouTube Data API")
    ingest.add_argument("--region", default=config.DEFAULT_REGION)
    ingest.add_argument("--max-videos", type=int, default=200)
    ingest.add_argument("--raw-dir", default=None, help="also archive raw API JSON here")
    ingest.set_defaults(func=_cmd_ingest)

    feature_sets = ["prepublish", "chartday"]
    train = sub.add_parser("train", help="train, evaluate and register models")
    train.add_argument("--feature-set", nargs="+", choices=feature_sets, default=feature_sets)
    train.add_argument("--region", default=config.DEFAULT_REGION)
    train.add_argument("--bootstrap", type=int, default=1000, help="bootstrap resamples for CIs")
    train.add_argument("--out", default=None, help="artifact directory (default ml/models)")
    train.add_argument("--no-register", dest="register", action="store_false")
    train.set_defaults(func=_cmd_train)

    score = sub.add_parser("score", help="score new chart videos with the latest model")
    score.add_argument("--feature-set", choices=feature_sets, default="chartday")
    score.add_argument("--region", default=config.DEFAULT_REGION)
    score.add_argument(
        "--include-training-period",
        action="store_true",
        help="also score videos the model was trained on (stored as in_sample)",
    )
    score.set_defaults(func=_cmd_score)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )
    result = args.func(args)
    json.dump(result, sys.stdout, indent=2, default=str)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
