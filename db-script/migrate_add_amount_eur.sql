-- EUR amount of each transaction, for "all currencies" totals; EUR is the base currency.
-- Non-EUR rows are converted by the server at the rate of the transaction date (on create/edit,
-- and the server fills rows that are still empty at startup and hourly).
-- Additive only: adds a nullable column and copies the amount into it for EUR rows.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount_eur NUMERIC(12, 2);

UPDATE transactions SET amount_eur = amount WHERE currency = 'EUR' AND amount_eur IS NULL;
