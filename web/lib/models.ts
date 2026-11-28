import models from "@/generated/models.json";

/** Subset of the training report written by tubescope.ml.train (each model folder has a report.json). */
export interface Metrics {
  n: number; positives: number; base_rate: number; roc_auc: number; average_precision: number;
  brier: number; log_loss: number; ece: number; threshold: number; flagged_rate: number;
  precision: number; recall: number; f1: number; precision_top10pct: number; lift_top10pct: number;
}

export interface ModelReport {
  name: string;
  feature_set: "prepublish" | "chartday";
  feature_set_description: string;
  features: string[];
  estimator: string;
  params: Record<string, number>;
  threshold: number;
  trained_at: string;
  trained_through: string;
  data: {
    labelled_rows: number; base_rate: number; date_range: [string, string]; channels: number;
    train_rows: number; train_range: [string, string]; test_rows: number;
    test_range: [string, string]; embargoed_rows: number; test_new_channel_rows: number;
  };
  comparison: Record<string, { description: string; baseline: boolean; calibrated: boolean; cv: Metrics; test: Metrics }>;
  test: { all_test: Metrics; new_channels?: Metrics; returning_channels?: Metrics };
  test_intervals_95: Record<"roc_auc" | "average_precision" | "brier", [number, number]>;
  versus_baselines: Record<string, { average_precision: { difference: number; ci_low: number; ci_high: number } }>;
  calibration_test: { n: number; mean_predicted: number; observed_rate: number }[];
  by_category_test: { category: string; n: number; observed_rate: number; mean_predicted: number }[];
  permutation_importance_test: { feature: string; ap_drop_mean: number; ap_drop_std: number }[];
  protocol_comparison: Record<string, { roc_auc: number; average_precision: number }>;
}

export const MODELS = models as unknown as Partial<Record<"prepublish" | "chartday", ModelReport>>;
