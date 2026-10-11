-- Line items of a transaction (e.g. products on a receipt).
-- The parent row in "transactions" holds the total; items are removed together with it.
CREATE TABLE IF NOT EXISTS transaction_items (
    id             SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    position       INTEGER NOT NULL,
    name           VARCHAR(500) NOT NULL,
    amount         NUMERIC(12, 2) NOT NULL,
    category_id    INTEGER REFERENCES categories(id),
    subcategory_id INTEGER REFERENCES subcategories(id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON transaction_items (transaction_id);
