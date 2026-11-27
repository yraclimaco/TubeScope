"""Render a model card from a training report. Every number comes from the report."""

from __future__ import annotations


def _pct(value) -> str:
    return "n/a" if value is None else f"{value:.1%}"


def _num(value, digits: int = 3) -> str:
    return "n/a" if value is None else f"{value:.{digits}f}"


def _ci(pair) -> str:
    return f"{pair[0]:.3f}–{pair[1]:.3f}"


def render_model_card(report: dict) -> str:
    d = report["data"]
    test = report["test"]["all_test"]
    ci = report["test_intervals_95"]
    lines = [
        f"# Model card: `{report['name']}`",
        "",
        "## What it predicts",
        "",
        "The probability that a video on YouTube's US most-popular chart is still on the chart "
        "the next day (its first chart run lasts more than one day). Videos whose outcome "
        "cannot be observed (they may have charted before the data starts, or the next day "
        "was never captured) are excluded from training and evaluation.",
        "",
        f"**Feature set: `{report['feature_set']}`.** {report['feature_set_description']}",
        "",
        f"Features: {', '.join(f'`{f}`' for f in report['features'])}.",
        "",
        f"Estimator: `{report['estimator']}` with parameters `{report['params'] or 'defaults'}`. "
        f"Decision threshold {report['threshold']:.3f} (maximises out-of-fold F1 on the "
        "training period).",
        "",
        "## Data",
        "",
        f"- {d['labelled_rows']:,} labelled videos from {d['channels']:,} channels, first "
        f"charting {d['date_range'][0]} to {d['date_range'][1]} (top-200 chart). "
        f"Base rate {_pct(d['base_rate'])}.",
        f"- Training period: {d['train_range'][0]} to {d['train_range'][1]} "
        f"({d['train_rows']:,} videos; {d['embargoed_rows']} videos from the day before the "
        "test period are dropped so no training label depends on a test-period day).",
        f"- Test period: {d['test_range'][0]} to {d['test_range'][1]} ({d['test_rows']:,} "
        f"videos, {d['test_new_channel_rows']:,} of them from channels never seen in training).",
        "- The deployed artifact is refitted on all labelled data with the same configuration.",
        "",
        "## Evaluation protocol",
        "",
        "Candidates were tuned and compared using 5-fold cross-validation grouped by channel on "
        "the training period only, and the one with the best out-of-fold average precision was "
        "chosen. The test period was used once, to report results. Confidence intervals "
        "resample whole channels, because videos from the same channel are not independent.",
        "",
        "## Results on the held-out period",
        "",
        "| Model | ROC AUC | Avg. precision | Brier | Calibration error | Precision | Recall |",
        "|---|---|---|---|---|---|---|",
    ]
    for name, entry in report["comparison"].items():
        t = entry["test"]
        marker = " **(chosen)**" if name == report["estimator"] else ""
        lines.append(
            f"| `{name}`{marker} | {_num(t['roc_auc'])} | {_num(t['average_precision'])} | "
            f"{_num(t['brier'])} | {_num(t['ece'])} | {_pct(t['precision'])} | "
            f"{_pct(t['recall'])} |"
        )
    lines += [
        "",
        f"Chosen model, 95% channel-bootstrap intervals: ROC AUC {_ci(ci['roc_auc'])}, "
        f"average precision {_ci(ci['average_precision'])}, Brier {_ci(ci['brier'])}.",
        "",
        f"At the threshold it flags {_pct(test['flagged_rate'])} of videos; "
        f"{_pct(test['precision'])} of flagged videos stay a second day (vs. a "
        f"{_pct(test['base_rate'])} base rate) and it catches {_pct(test['recall'])} of the "
        f"videos that do. The top 10% of scores are right {_pct(test['precision_top10pct'])} "
        f"of the time ({_num(test['lift_top10pct'], 2)}x the base rate).",
        "",
    ]
    versus = report.get("versus_baselines", {})
    if "category_only" in versus:
        v = versus["category_only"]["average_precision"]
        lines += [
            f"Against the category-only baseline, average precision improves by "
            f"{v['difference']:.3f} (95% CI {v['ci_low']:.3f} to {v['ci_high']:.3f}).",
            "",
        ]
    if "new_channels" in report["test"]:
        nc, rc = report["test"]["new_channels"], report["test"]["returning_channels"]
        lines += [
            "### New vs. returning channels",
            "",
            "| Test subset | Videos | Base rate | ROC AUC | Avg. precision | Calibration error |",
            "|---|---|---|---|---|---|",
            f"| Channels seen in training | {rc['n']:,} | {_pct(rc['base_rate'])} | "
            f"{_num(rc['roc_auc'])} | {_num(rc['average_precision'])} | {_num(rc['ece'])} |",
            f"| New channels | {nc['n']:,} | {_pct(nc['base_rate'])} | {_num(nc['roc_auc'])} | "
            f"{_num(nc['average_precision'])} | {_num(nc['ece'])} |",
            "",
        ]
    protocol = report["protocol_comparison"]
    lines += [
        "### Why the split matters",
        "",
        "The same configuration scored with the original project's random 80/20 split:",
        "",
        "| Split | ROC AUC | Avg. precision |",
        "|---|---|---|",
        f"| Random (original protocol) | {_num(protocol['random_split']['roc_auc'])} | "
        f"{_num(protocol['random_split']['average_precision'])} |",
        f"| Later days held out | {_num(protocol['temporal_holdout']['roc_auc'])} | "
        f"{_num(protocol['temporal_holdout']['average_precision'])} |",
        "",
        "## Calibration (held-out period, 10 equal-size bins)",
        "",
        "| Mean predicted | Observed | Videos |",
        "|---|---|---|",
    ]
    for row in report["calibration_test"]:
        lines.append(
            f"| {_pct(row['mean_predicted'])} | {_pct(row['observed_rate'])} | {row['n']} |"
        )
    lines += [
        "",
        "## By category (held-out period, categories with 50+ videos)",
        "",
        "| Category | Videos | Observed | Mean predicted |",
        "|---|---|---|---|",
    ]
    for row in report["by_category_test"]:
        lines.append(
            f"| {row['category']} | {row['n']} | {_pct(row['observed_rate'])} | "
            f"{_pct(row['mean_predicted'])} |"
        )
    lines += [
        "",
        "## Which features matter",
        "",
        "Drop in held-out average precision when one feature is shuffled (10 repeats). "
        "Correlated features share credit: shuffling duration also destroys the category "
        "information that video length carries, so this is not a causal ranking.",
        "",
        "| Feature | AP drop | ± |",
        "|---|---|---|",
    ]
    for row in report["permutation_importance_test"]:
        lines.append(
            f"| `{row['feature']}` | {row['ap_drop_mean']:.4f} | {row['ap_drop_std']:.4f} |"
        )
    lines += [
        "",
        "## Limitations",
        "",
        f"- About seven weeks of one country's chart ({d['date_range'][0]} to "
        f"{d['date_range'][1]}). Seasonal patterns and chart-algorithm changes are not covered.",
        "- The chart is YouTube's own most-popular selection, not a raw view ranking. The model "
        "learns what that list keeps, not what goes viral in general.",
        "- Only videos that already reached the chart are in the data. Probabilities are "
        "conditional on charting and say nothing about videos that never chart.",
        "- Channel statistics are taken from the video's first chart day; a creator using the "
        "what-if simulator supplies current statistics instead.",
        "- Publish hour and weekday are in Pacific time.",
        "",
        f"Trained {report['trained_at']} from commit `{report['git_sha']}` with scikit-learn "
        f"{report['sklearn_version']}.",
        "",
    ]
    return "\n".join(lines)
