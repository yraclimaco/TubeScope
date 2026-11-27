-- Extra registry detail for Phase 2 models.
ALTER TABLE ml.model_version
    ADD COLUMN feature_set     text,
    ADD COLUMN estimator       text,
    ADD COLUMN trained_through date;

-- A prediction is in-sample when its video was part of the model's training data. Only
-- out-of-sample predictions count towards live accuracy.
ALTER TABLE ml.prediction
    ADD COLUMN in_sample boolean NOT NULL DEFAULT false;

CREATE INDEX prediction_scored_for_date_idx ON ml.prediction (scored_for_date);
