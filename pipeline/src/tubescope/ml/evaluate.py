"""Metrics for a rare-ish binary outcome, with uncertainty that respects channel clustering."""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    log_loss,
    precision_recall_curve,
    roc_auc_score,
)


def expected_calibration_error(y: np.ndarray, p: np.ndarray, bins: int = 10) -> float:
    """Weighted mean |observed rate - mean prediction| over equal-count bins."""
    table = calibration_table(y, p, bins)
    return float(np.sum(table["n"] * (table["observed_rate"] - table["mean_predicted"]).abs())
                 / table["n"].sum())  # fmt: skip


def calibration_table(y: np.ndarray, p: np.ndarray, bins: int = 10) -> pd.DataFrame:
    frame = pd.DataFrame({"y": np.asarray(y, dtype=float), "p": np.asarray(p, dtype=float)})
    frame["bin"] = pd.qcut(frame["p"].rank(method="first"), q=min(bins, len(frame)), labels=False)
    table = frame.groupby("bin").agg(
        n=("y", "size"), mean_predicted=("p", "mean"), observed_rate=("y", "mean")
    )
    return table.reset_index(drop=True)


def best_f1_threshold(y: np.ndarray, p: np.ndarray) -> float:
    precision, recall, thresholds = precision_recall_curve(y, p)
    total = precision + recall
    f1 = np.divide(2 * precision * recall, total, out=np.zeros_like(total), where=total > 0)
    # precision/recall have one more entry than thresholds; the last point has no threshold.
    return float(thresholds[int(np.argmax(f1[:-1]))])


def top_fraction_precision(y: np.ndarray, p: np.ndarray, fraction: float = 0.1) -> float:
    k = max(1, int(round(len(p) * fraction)))
    order = np.argsort(-np.asarray(p), kind="stable")[:k]
    return float(np.asarray(y)[order].mean())


def classification_metrics(y, p, threshold: float) -> dict[str, float]:
    y = np.asarray(y, dtype=int)
    p = np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)
    flagged = p >= threshold
    tp = int(np.sum(flagged & (y == 1)))
    base_rate = float(y.mean())
    both_classes = 0 < y.sum() < len(y)
    precision = tp / flagged.sum() if flagged.sum() else 0.0
    recall = tp / y.sum() if y.sum() else 0.0
    top10 = top_fraction_precision(y, p, 0.1)
    return {
        "n": int(len(y)),
        "positives": int(y.sum()),
        "base_rate": base_rate,
        "roc_auc": float(roc_auc_score(y, p)) if both_classes else float("nan"),
        "average_precision": float(average_precision_score(y, p)) if both_classes else float("nan"),
        "brier": float(brier_score_loss(y, p)),
        "log_loss": float(log_loss(y, p, labels=[0, 1])),
        "ece": expected_calibration_error(y, p),
        "threshold": float(threshold),
        "flagged_rate": float(flagged.mean()),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(2 * precision * recall / (precision + recall)) if precision + recall else 0.0,
        "precision_top10pct": top10,
        "lift_top10pct": top10 / base_rate if base_rate else float("nan"),
    }


def cluster_bootstrap_ci(
    y,
    p,
    groups,
    metric: Callable[[np.ndarray, np.ndarray], float],
    *,
    n_boot: int = 1000,
    alpha: float = 0.05,
    seed: int = 0,
) -> tuple[float, float]:
    """Percentile CI from resampling whole channels with replacement."""
    y, p, groups = np.asarray(y), np.asarray(p), np.asarray(groups)
    unique, inverse = np.unique(groups, return_inverse=True)
    members = [np.flatnonzero(inverse == g) for g in range(len(unique))]
    rng = np.random.default_rng(seed)
    stats = []
    for _ in range(n_boot):
        picked = rng.integers(0, len(unique), len(unique))
        idx = np.concatenate([members[g] for g in picked])
        if 0 < y[idx].sum() < len(idx):
            stats.append(metric(y[idx], p[idx]))
    lo, hi = np.quantile(stats, [alpha / 2, 1 - alpha / 2])
    return float(lo), float(hi)


def paired_bootstrap_diff(
    y,
    p_a,
    p_b,
    groups,
    metric: Callable[[np.ndarray, np.ndarray], float],
    *,
    n_boot: int = 1000,
    seed: int = 0,
) -> dict[str, float]:
    """metric(a) - metric(b) with a channel-cluster bootstrap CI and the share of draws <= 0."""
    y, p_a, p_b, groups = map(np.asarray, (y, p_a, p_b, groups))
    unique, inverse = np.unique(groups, return_inverse=True)
    members = [np.flatnonzero(inverse == g) for g in range(len(unique))]
    rng = np.random.default_rng(seed)
    diffs = []
    for _ in range(n_boot):
        picked = rng.integers(0, len(unique), len(unique))
        idx = np.concatenate([members[g] for g in picked])
        if 0 < y[idx].sum() < len(idx):
            diffs.append(metric(y[idx], p_a[idx]) - metric(y[idx], p_b[idx]))
    diffs = np.asarray(diffs)
    lo, hi = np.quantile(diffs, [0.025, 0.975])
    return {
        "difference": float(metric(y, p_a) - metric(y, p_b)),
        "ci_low": float(lo),
        "ci_high": float(hi),
        "share_not_better": float(np.mean(diffs <= 0)),
    }
