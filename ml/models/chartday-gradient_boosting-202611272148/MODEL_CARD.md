# Model card: `chartday-gradient_boosting-202611272148`

## What it predicts

The probability that a video on YouTube's US most-popular chart is still on the chart the next day (its first chart run lasts more than one day). Videos whose outcome cannot be observed (they may have charted before the data starts, or the next day was never captured) are excluded from training and evaluation.

**Feature set: `chartday`.** Everything in prepublish plus what is known at the end of a video's first chart day: views, engagement and how long after publishing it charted. Used for daily scoring.

Features: `channel_subscribers`, `channel_total_views`, `channel_video_count`, `channel_age_days`, `duration_minutes`, `description_word_count`, `tags_count`, `first_day_views`, `days_published_before_chart`, `title_char_count`, `first_day_engagement_rate`, `publish_hour_pt`, `publish_isodow_pt`, `category_id`, `definition`, `licensed_content`, `channel_country`.

Estimator: `gradient_boosting` with parameters `{'model__l2_regularization': 1.0, 'model__learning_rate': 0.03, 'model__max_leaf_nodes': 31, 'model__min_samples_leaf': 80}`. Decision threshold 0.353 (maximises out-of-fold F1 on the training period).

## Data

- 7,519 labelled videos from 2,327 channels, first charting 2025-10-01 to 2025-11-18 (top-200 chart). Base rate 17.8%.
- Training period: 2025-10-01 to 2025-11-08 (5,880 videos; 150 videos from the day before the test period are dropped so no training label depends on a test-period day).
- Test period: 2025-11-10 to 2025-11-18 (1,489 videos, 330 of them from channels never seen in training).
- The deployed artifact is refitted on all labelled data with the same configuration.

## Evaluation protocol

Candidates were tuned and compared using 5-fold cross-validation grouped by channel on the training period only, and the one with the best out-of-fold average precision was chosen. The test period was used once, to report results. Confidence intervals resample whole channels, because videos from the same channel are not independent.

## Results on the held-out period

| Model | ROC AUC | Avg. precision | Brier | Calibration error | Precision | Recall |
|---|---|---|---|---|---|---|
| `prior` | 0.500 | 0.167 | 0.139 | 0.028 | 16.7% | 100.0% |
| `category_only` | 0.677 | 0.325 | 0.123 | 0.030 | 39.5% | 47.6% |
| `logistic` | 0.804 | 0.486 | 0.110 | 0.021 | 42.3% | 64.1% |
| `random_forest` | 0.878 | 0.607 | 0.094 | 0.018 | 48.7% | 76.6% |
| `gradient_boosting` **(chosen)** | 0.900 | 0.658 | 0.086 | 0.023 | 59.6% | 65.3% |

Chosen model, 95% channel-bootstrap intervals: ROC AUC 0.874–0.921, average precision 0.590–0.723, Brier 0.075–0.099.

At the threshold it flags 18.3% of videos; 59.6% of flagged videos stay a second day (vs. a 16.7% base rate) and it catches 65.3% of the videos that do. The top 10% of scores are right 72.5% of the time (4.35x the base rate).

Against the category-only baseline, average precision improves by 0.333 (95% CI 0.274 to 0.394).

### New vs. returning channels

| Test subset | Videos | Base rate | ROC AUC | Avg. precision | Calibration error |
|---|---|---|---|---|---|
| Channels seen in training | 1,159 | 15.3% | 0.915 | 0.689 | 0.027 |
| New channels | 330 | 21.5% | 0.843 | 0.594 | 0.050 |

### Why the split matters

The same configuration scored with the original project's random 80/20 split:

| Split | ROC AUC | Avg. precision |
|---|---|---|
| Random (original protocol) | 0.922 | 0.707 |
| Later days held out | 0.900 | 0.658 |

## Calibration (held-out period, 10 equal-size bins)

| Mean predicted | Observed | Videos |
|---|---|---|
| 0.0% | 0.0% | 149 |
| 0.2% | 0.7% | 149 |
| 0.5% | 0.7% | 149 |
| 1.3% | 4.0% | 149 |
| 2.8% | 5.4% | 149 |
| 6.0% | 2.7% | 148 |
| 12.7% | 10.7% | 149 |
| 24.6% | 24.8% | 149 |
| 41.6% | 45.0% | 149 |
| 64.6% | 72.5% | 149 |

## By category (held-out period, categories with 50+ videos)

| Category | Videos | Observed | Mean predicted |
|---|---|---|---|
| Gaming | 1000 | 10.8% | 8.3% |
| Music | 189 | 48.7% | 48.2% |
| Entertainment | 163 | 9.2% | 13.2% |
| People & Blogs | 73 | 20.5% | 21.5% |

## Which features matter

Drop in held-out average precision when one feature is shuffled (10 repeats). Correlated features share credit: shuffling duration also destroys the category information that video length carries, so this is not a causal ranking.

| Feature | AP drop | ± |
|---|---|---|
| `first_day_views` | 0.2571 | 0.0186 |
| `days_published_before_chart` | 0.1083 | 0.0137 |
| `duration_minutes` | 0.1050 | 0.0170 |
| `first_day_engagement_rate` | 0.0599 | 0.0139 |
| `category_id` | 0.0584 | 0.0163 |
| `publish_hour_pt` | 0.0482 | 0.0076 |
| `channel_total_views` | 0.0256 | 0.0115 |
| `channel_video_count` | 0.0232 | 0.0040 |
| `channel_subscribers` | 0.0198 | 0.0065 |
| `title_char_count` | 0.0124 | 0.0042 |
| `description_word_count` | 0.0114 | 0.0037 |
| `channel_country` | 0.0091 | 0.0066 |
| `publish_isodow_pt` | 0.0082 | 0.0053 |
| `channel_age_days` | 0.0072 | 0.0064 |
| `tags_count` | 0.0053 | 0.0066 |
| `licensed_content` | 0.0010 | 0.0004 |
| `definition` | 0.0000 | 0.0000 |

## Limitations

- About seven weeks of one country's chart (2025-10-01 to 2025-11-18). Seasonal patterns and chart-algorithm changes are not covered.
- The chart is YouTube's own most-popular selection, not a raw view ranking. The model learns what that list keeps, not what goes viral in general.
- Only videos that already reached the chart are in the data. Probabilities are conditional on charting and say nothing about videos that never chart.
- Channel statistics are taken from the video's first chart day; a creator using the what-if simulator supplies current statistics instead.
- Publish hour and weekday are in Pacific time.

Trained 2026-11-27T21:48:29.318439+00:00 from commit `18848a8-dirty` with scikit-learn 1.9.1.
