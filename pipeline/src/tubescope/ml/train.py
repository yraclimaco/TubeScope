"""Train, evaluate and package a model for one feature set.

Protocol:
1. Hold out the most recent ~20% of chart days (with a one-day embargo).
2. Tune and compare every candidate with channel-grouped 5-fold CV on the training period
   only; choose the candidate with the best out-of-fold average precision.
3. Pick the decision threshold that maximises out-of-fold F1.
4. Report every candidate on the held-out period once, with channel-cluster bootstrap CIs.
5. Refit the chosen configuration on all labelled data for deployment.
"""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
import pandas as pd
import sklearn
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.inspection import permutation_importance
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GridSearchCV, cross_val_predict, train_test_split
from threadpoolctl import threadpool_limits

from . import evaluate
from .dataset import DATE, GROUP, LABEL, ChannelKFold, temporal_split
from .features import FEATURE_SETS
from .models import Candidate, candidates

log = logging.getLogger(__name__)

N_FOLDS = 5


@dataclass
class TrainResult:
    name: str
    model: object
    threshold: float
    report: dict


def _build(candidate: Candidate, params: dict):
    estimator = clone(candidate.estimator).set_params(**params)
    if candidate.calibrate:
        estimator = CalibratedClassifierCV(estimator, method="isotonic", cv=ChannelKFold(N_FOLDS))
    return estimator


def _tune(candidate: Candidate, X: pd.DataFrame, y: np.ndarray) -> dict:
    if not candidate.grid:
        return {}
    search = GridSearchCV(
        candidate.estimator,
        candidate.grid,
        scoring="average_precision",
        cv=ChannelKFold(N_FOLDS),
        refit=False,
    )
    search.fit(X, y)
    return dict(search.best_params_)


def _git_sha() -> str | None:
    try:
        sha = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
        dirty = subprocess.run(
            ["git", "status", "--porcelain"], capture_output=True, text=True, check=True
        ).stdout.strip()
        return f"{sha}-dirty" if dirty else sha
    except (OSError, subprocess.CalledProcessError):
        return None


def _clean(value):
    """Make a report JSON-safe (NaN -> None, numpy scalars -> Python)."""
    if isinstance(value, dict):
        return {str(k): _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and np.isnan(value):
        return None
    return value


def train(
    data: pd.DataFrame,
    feature_set_name: str,
    *,
    test_fraction: float = 0.2,
    n_boot: int = 1000,
    seed: int = 0,
    only: list[str] | None = None,
) -> TrainResult:
    """``data`` must be labelled rows of ``analytics.video_features`` (see dataset.labelled).

    OpenMP is capped at one thread: on a few thousand rows, gradient boosting spends more time
    synchronising threads than computing (single-threaded fits measured ~8x faster).
    """
    with threadpool_limits(limits=1, user_api="openmp"):
        return _train(
            data, feature_set_name, test_fraction=test_fraction, n_boot=n_boot, seed=seed, only=only
        )


def _train(
    data: pd.DataFrame,
    feature_set_name: str,
    *,
    test_fraction: float,
    n_boot: int,
    seed: int,
    only: list[str] | None,
) -> TrainResult:
    feature_set = FEATURE_SETS[feature_set_name]
    columns = [*feature_set.columns, GROUP]
    split = temporal_split(data, test_fraction)
    X_train, y_train = split.train[columns], split.train[LABEL].to_numpy()
    X_test, y_test = split.test[columns], split.test[LABEL].to_numpy()
    test_groups = split.test[GROUP].to_numpy()
    new_channel = ~split.test[GROUP].isin(set(split.train[GROUP])).to_numpy()
    log.info(
        "train %d rows (%s..%s), test %d rows from %s, %d embargoed",
        len(split.train), split.train[DATE].min(), split.train[DATE].max(),
        len(split.test), split.cutoff, split.embargoed,
    )  # fmt: skip

    pool = [c for c in candidates(feature_set, seed) if only is None or c.name in only]
    results = {}
    for candidate in pool:
        params = _tune(candidate, X_train, y_train)
        estimator = _build(candidate, params)
        oof = cross_val_predict(
            estimator, X_train, y_train, cv=ChannelKFold(N_FOLDS), method="predict_proba"
        )[:, 1]
        threshold = evaluate.best_f1_threshold(y_train, oof)
        fitted = clone(estimator).fit(X_train, y_train)
        p_test = fitted.predict_proba(X_test)[:, 1]
        results[candidate.name] = {
            "candidate": candidate,
            "params": params,
            "fitted": fitted,
            "oof": oof,
            "p_test": p_test,
            "threshold": threshold,
        }
        log.info(
            "%s: cv AP %.3f, test AP %.3f",
            candidate.name, average_precision_score(y_train, oof),
            average_precision_score(y_test, p_test),
        )  # fmt: skip

    chosen_name = max(results, key=lambda n: average_precision_score(y_train, results[n]["oof"]))
    chosen = results[chosen_name]
    threshold = chosen["threshold"]

    comparison = {}
    for name, r in results.items():
        comparison[name] = {
            "description": r["candidate"].description,
            "baseline": r["candidate"].baseline,
            "calibrated": r["candidate"].calibrate,
            "params": r["params"],
            "cv": evaluate.classification_metrics(y_train, r["oof"], r["threshold"]),
            "test": evaluate.classification_metrics(y_test, r["p_test"], r["threshold"]),
        }

    p = chosen["p_test"]
    intervals = {
        "roc_auc": evaluate.cluster_bootstrap_ci(
            y_test, p, test_groups, roc_auc_score, n_boot=n_boot, seed=seed
        ),
        "average_precision": evaluate.cluster_bootstrap_ci(
            y_test, p, test_groups, average_precision_score, n_boot=n_boot, seed=seed
        ),
        "brier": evaluate.cluster_bootstrap_ci(
            y_test, p, test_groups, brier_score_loss, n_boot=n_boot, seed=seed
        ),
    }
    versus = {}
    for baseline in ("category_only", "prior"):
        if baseline in results and baseline != chosen_name:
            p_base = results[baseline]["p_test"]
            versus[baseline] = {
                "average_precision": evaluate.paired_bootstrap_diff(
                    y_test, p, p_base, test_groups, average_precision_score, n_boot=n_boot,
                    seed=seed,
                ),
                # Lower Brier is better, so compare base minus model: positive = model better.
                "brier_improvement": evaluate.paired_bootstrap_diff(
                    y_test, p_base, p, test_groups, brier_score_loss, n_boot=n_boot, seed=seed
                ),
            }  # fmt: skip

    subsets = {"all_test": evaluate.classification_metrics(y_test, p, threshold)}
    if new_channel.sum() and 0 < y_test[new_channel].sum() < new_channel.sum():
        subsets["new_channels"] = evaluate.classification_metrics(
            y_test[new_channel], p[new_channel], threshold
        )
        subsets["returning_channels"] = evaluate.classification_metrics(
            y_test[~new_channel], p[~new_channel], threshold
        )

    by_category = (
        split.test.assign(p=p)
        .groupby("category", dropna=False)
        .agg(n=(LABEL, "size"), observed_rate=(LABEL, "mean"), mean_predicted=("p", "mean"))
        .query("n >= 50")
        .sort_values("n", ascending=False)
        .reset_index()
    )

    importance = permutation_importance(
        chosen["fitted"], X_test, y_test, scoring="average_precision", n_repeats=10,
        random_state=seed,
    )  # fmt: skip
    importances = (
        pd.DataFrame(
            {
                "feature": columns,
                "ap_drop_mean": importance.importances_mean,
                "ap_drop_std": importance.importances_std,
            }
        )
        .query("feature != @GROUP")
        .sort_values("ap_drop_mean", ascending=False)
        .reset_index(drop=True)
    )

    # How much a random split (the original project's protocol) flatters the same model.
    X_all, y_all = data[columns], data[LABEL].to_numpy()
    Xr_train, Xr_test, yr_train, yr_test = train_test_split(
        X_all, y_all, test_size=test_fraction, stratify=y_all, random_state=seed
    )
    random_fit = _build(chosen["candidate"], chosen["params"]).fit(Xr_train, yr_train)
    pr = random_fit.predict_proba(Xr_test)[:, 1]
    protocol = {
        "random_split": {
            "roc_auc": float(roc_auc_score(yr_test, pr)),
            "average_precision": float(average_precision_score(yr_test, pr)),
        },
        "temporal_holdout": {
            "roc_auc": subsets["all_test"]["roc_auc"],
            "average_precision": subsets["all_test"]["average_precision"],
        },
    }
    if "new_channels" in subsets:
        protocol["temporal_holdout_new_channels"] = {
            "roc_auc": subsets["new_channels"]["roc_auc"],
            "average_precision": subsets["new_channels"]["average_precision"],
        }

    final = _build(chosen["candidate"], chosen["params"]).fit(X_all, y_all)
    trained_at = datetime.now(UTC)
    trained_through = max(data[DATE])
    name = f"{feature_set_name}-{chosen_name}-{trained_at:%Y%m%d%H%M}"

    report = {
        "name": name,
        "feature_set": feature_set_name,
        "feature_set_description": feature_set.description,
        "features": feature_set.columns,
        "estimator": chosen_name,
        "params": chosen["params"],
        "threshold": threshold,
        "trained_at": trained_at.isoformat(),
        "trained_through": trained_through.isoformat(),
        "git_sha": _git_sha(),
        "sklearn_version": sklearn.__version__,
        "data": {
            "labelled_rows": len(data),
            "base_rate": float(data[LABEL].mean()),
            "date_range": [min(data[DATE]).isoformat(), trained_through.isoformat()],
            "channels": int(data[GROUP].nunique()),
            "train_rows": len(split.train),
            "train_range": [
                split.train[DATE].min().isoformat(),
                split.train[DATE].max().isoformat(),
            ],
            "test_rows": len(split.test),
            "test_range": [split.cutoff.isoformat(), split.test[DATE].max().isoformat()],
            "embargoed_rows": split.embargoed,
            "test_new_channel_rows": int(new_channel.sum()),
        },  # fmt: skip
        "selection": {
            "rule": "highest channel-grouped out-of-fold average precision on training period",
            "chosen": chosen_name,
        },
        "comparison": comparison,
        "test": subsets,
        "test_intervals_95": intervals,
        "versus_baselines": versus,
        "calibration_test": evaluate.calibration_table(y_test, p).to_dict(orient="records"),
        "by_category_test": by_category.to_dict(orient="records"),
        "permutation_importance_test": importances.to_dict(orient="records"),
        "protocol_comparison": protocol,
    }
    return TrainResult(name=name, model=final, threshold=threshold, report=_clean(report))
