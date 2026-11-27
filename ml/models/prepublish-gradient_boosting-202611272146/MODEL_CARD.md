# Model card: `prepublish-gradient_boosting-202611272146`

## What it predicts

The probability that a video on YouTube's US most-popular chart is still on the chart the next day (its first chart run lasts more than one day). Videos whose outcome cannot be observed (they may have charted before the data starts, or the next day was never captured) are excluded from training and evaluation.

**Feature set: `prepublish`.** What a creator knows before publishing: channel size, video length, metadata and publish time. Used for the what-if simulator.

Features: `channel_subscribers`, `channel_total_views`, `channel_video_count`, `channel_age_days`, `duration_minutes`, `description_word_count`, `tags_count`, `title_char_count`, `publish_hour_pt`, `publish_isodow_pt`, `category_id`, `definition`, `licensed_content`, `channel_country`.

Estimator: `gradient_boosting` with parameters `{'model__l2_regularization': 1.0, 'model__learning_rate': 0.03, 'model__max_leaf_nodes': 15, 'model__min_samples_leaf': 20}`. Decision threshold 0.287 (maximises out-of-fold F1 on the training period).

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
| `logistic` | 0.737 | 0.378 | 0.121 | 0.026 | 40.9% | 56.5% |
| `random_forest` | 0.835 | 0.477 | 0.106 | 0.018 | 46.0% | 64.1% |
| `gradient_boosting` **(chosen)** | 0.830 | 0.471 | 0.107 | 0.014 | 46.0% | 67.7% |

Chosen model, 95% channel-bootstrap intervals: ROC AUC 0.793–0.858, average precision 0.409–0.542, Brier 0.094–0.120.

At the threshold it flags 24.5% of videos; 46.0% of flagged videos stay a second day (vs. a 16.7% base rate) and it catches 67.7% of the videos that do. The top 10% of scores are right 55.7% of the time (3.34x the base rate).

Against the category-only baseline, average precision improves by 0.146 (95% CI 0.100 to 0.199).

### New vs. returning channels

| Test subset | Videos | Base rate | ROC AUC | Avg. precision | Calibration error |
|---|---|---|---|---|---|
| Channels seen in training | 1,159 | 15.3% | 0.837 | 0.475 | 0.021 |
| New channels | 330 | 21.5% | 0.800 | 0.493 | 0.044 |

### Why the split matters

The same configuration scored with the original project's random 80/20 split:

| Split | ROC AUC | Avg. precision |
|---|---|---|
| Random (original protocol) | 0.864 | 0.527 |
| Later days held out | 0.830 | 0.471 |

## Calibration (held-out period, 10 equal-size bins)

| Mean predicted | Observed | Videos |
|---|---|---|
| 0.9% | 2.7% | 149 |
| 2.2% | 2.7% | 149 |
| 3.5% | 3.4% | 149 |
| 4.7% | 4.0% | 149 |
| 6.6% | 6.7% | 149 |
| 9.8% | 10.1% | 148 |
| 14.9% | 10.1% | 149 |
| 27.9% | 27.5% | 149 |
| 40.8% | 43.6% | 149 |
| 53.8% | 55.7% | 149 |

## By category (held-out period, categories with 50+ videos)

| Category | Videos | Observed | Mean predicted |
|---|---|---|---|
| Gaming | 1000 | 10.8% | 9.7% |
| Music | 189 | 48.7% | 47.5% |
| Entertainment | 163 | 9.2% | 15.6% |
| People & Blogs | 73 | 20.5% | 20.7% |

## Which features matter

Drop in held-out average precision when one feature is shuffled (10 repeats). Correlated features share credit: shuffling duration also destroys the category information that video length carries, so this is not a causal ranking.

| Feature | AP drop | ± |
|---|---|---|
| `duration_minutes` | 0.1165 | 0.0115 |
| `channel_video_count` | 0.0691 | 0.0076 |
| `channel_total_views` | 0.0686 | 0.0095 |
| `channel_subscribers` | 0.0575 | 0.0077 |
| `category_id` | 0.0364 | 0.0174 |
| `description_word_count` | 0.0209 | 0.0049 |
| `channel_age_days` | 0.0200 | 0.0052 |
| `tags_count` | 0.0181 | 0.0035 |
| `publish_hour_pt` | 0.0174 | 0.0106 |
| `publish_isodow_pt` | 0.0154 | 0.0031 |
| `title_char_count` | 0.0070 | 0.0085 |
| `channel_country` | 0.0054 | 0.0047 |
| `definition` | 0.0000 | 0.0000 |
| `licensed_content` | -0.0054 | 0.0029 |

## Limitations

- About seven weeks of one country's chart (2025-10-01 to 2025-11-18). Seasonal patterns and chart-algorithm changes are not covered.
- The chart is YouTube's own most-popular selection, not a raw view ranking. The model learns what that list keeps, not what goes viral in general.
- Only videos that already reached the chart are in the data. Probabilities are conditional on charting and say nothing about videos that never chart.
- Channel statistics are taken from the video's first chart day; a creator using the what-if simulator supplies current statistics instead.
- Publish hour and weekday are in Pacific time.

Trained 2026-11-27T21:46:23.906446+00:00 from commit `18848a8-dirty` with scikit-learn 1.9.1.
