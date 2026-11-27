"""Candidate estimators, from naive baselines to gradient boosting."""

from __future__ import annotations

from dataclasses import dataclass, field

from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from .features import FeatureSet, build_preprocessor


@dataclass
class Candidate:
    name: str
    description: str
    estimator: Pipeline
    grid: dict[str, list] = field(default_factory=dict)
    # Isotonic calibration on channel-grouped folds. Off for models whose loss already yields
    # calibrated probabilities (logistic regression) and for the constant baseline.
    calibrate: bool = False
    baseline: bool = False


def candidates(feature_set: FeatureSet, seed: int = 0) -> list[Candidate]:
    return [
        Candidate(
            name="prior",
            description="Predicts the training base rate for every video.",
            estimator=Pipeline([("model", DummyClassifier(strategy="prior"))]),
            baseline=True,
        ),
        Candidate(
            name="category_only",
            description="Logistic regression on category alone: the category's historical rate.",
            estimator=Pipeline(
                [
                    (
                        "prep",
                        build_preprocessor(
                            feature_set, impute=False, scale=False, only=("category_id",)
                        ),
                    ),
                    ("model", LogisticRegression(max_iter=1000)),
                ]
            ),
            baseline=True,
        ),
        Candidate(
            name="logistic",
            description="L2 logistic regression on all features (log-scaled, standardised).",
            estimator=Pipeline(
                [
                    ("prep", build_preprocessor(feature_set, impute=True, scale=True)),
                    ("model", LogisticRegression(max_iter=5000)),
                ]
            ),
            grid={"model__C": [0.01, 0.1, 1.0, 10.0]},
        ),
        Candidate(
            name="random_forest",
            description=(
                "Random forest with the original project's hyperparameters (balanced class "
                "weights), followed by isotonic calibration."
            ),
            estimator=Pipeline(
                [
                    ("prep", build_preprocessor(feature_set, impute=True, scale=False)),
                    (
                        "model",
                        RandomForestClassifier(
                            n_estimators=200,
                            max_depth=15,
                            min_samples_split=10,
                            min_samples_leaf=5,
                            class_weight="balanced",
                            random_state=seed,
                            n_jobs=-1,
                        ),
                    ),
                ]
            ),
            calibrate=True,
        ),
        Candidate(
            name="gradient_boosting",
            description="Histogram gradient boosting, followed by isotonic calibration.",
            estimator=Pipeline(
                [
                    ("prep", build_preprocessor(feature_set, impute=False, scale=False)),
                    (
                        "model",
                        HistGradientBoostingClassifier(max_iter=300, random_state=seed),
                    ),
                ]
            ),
            grid={
                "model__learning_rate": [0.03, 0.1],
                "model__max_leaf_nodes": [15, 31],
                "model__min_samples_leaf": [20, 80],
                "model__l2_regularization": [0.0, 1.0],
            },
            calibrate=True,
        ),
    ]
