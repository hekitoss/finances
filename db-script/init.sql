CREATE TABLE categories (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE persons (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE subcategories (
    id          SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL,
    name        VARCHAR(100) NOT NULL,
    CONSTRAINT uq_subcategories_category_id_name UNIQUE (category_id, name)
);

CREATE TABLE transactions (
    id               SERIAL PRIMARY KEY,
    transaction_date DATE NOT NULL,
    amount           NUMERIC(12, 2) NOT NULL,
    currency         VARCHAR(3) NOT NULL DEFAULT 'EUR',
    person_id        INTEGER REFERENCES persons(id),
    category_id      INTEGER NOT NULL REFERENCES categories(id),
    subcategory_id   INTEGER REFERENCES subcategories(id),
    comment          VARCHAR(1000)
);

INSERT INTO categories (name) VALUES
('Income'),
('Food'),
('Transport'),
('Housing'),
('Utilities'),
('Entertainment'),
('Health'),
('Subscriptions');

INSERT INTO persons (name) VALUES
('Nikita'),
('Natasha');

INSERT INTO subcategories (category_id, name) VALUES
((SELECT id FROM categories WHERE name = 'Income'), 'Salary'),
((SELECT id FROM categories WHERE name = 'Income'), 'Freelance'),
((SELECT id FROM categories WHERE name = 'Food'), 'Groceries'),
((SELECT id FROM categories WHERE name = 'Food'), 'Coffee'),
((SELECT id FROM categories WHERE name = 'Transport'), 'Public transport'),
((SELECT id FROM categories WHERE name = 'Housing'), 'Rent'),
((SELECT id FROM categories WHERE name = 'Utilities'), 'Internet'),
((SELECT id FROM categories WHERE name = 'Entertainment'), 'Cinema'),
((SELECT id FROM categories WHERE name = 'Health'), 'Pharmacy'),
((SELECT id FROM categories WHERE name = 'Subscriptions'), 'Software');

-- Useful indexes for typical queries (filtering by date range, category)
CREATE INDEX idx_transactions_date ON transactions (transaction_date);
CREATE INDEX idx_transactions_category_id ON transactions (category_id);
CREATE INDEX idx_transactions_person_id ON transactions (person_id);
CREATE INDEX idx_transactions_subcategory_id ON transactions (subcategory_id);
CREATE INDEX idx_subcategories_category_id ON subcategories (category_id);

CREATE TABLE transaction_items (
    id             SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    position       INTEGER NOT NULL,
    name           VARCHAR(500) NOT NULL,
    amount         NUMERIC(12, 2) NOT NULL,
    category_id    INTEGER REFERENCES categories(id),
    subcategory_id INTEGER REFERENCES subcategories(id)
);
CREATE INDEX idx_transaction_items_transaction_id ON transaction_items (transaction_id);

CREATE TABLE tags (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    CONSTRAINT uq_tags_name UNIQUE (name)
);

CREATE TABLE transaction_tags (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id         INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
);
CREATE INDEX idx_transaction_tags_tag_id ON transaction_tags (tag_id);

INSERT INTO transactions (transaction_date, amount, currency, person_id, category_id, subcategory_id, comment) VALUES
(
    '2026-07-01',
    4200.00,
    'EUR',
    (SELECT id FROM persons WHERE name = 'Nikita'),
    (SELECT id FROM categories WHERE name = 'Income'),
    (
        SELECT s.id
        FROM subcategories s
        JOIN categories c ON c.id = s.category_id
        WHERE c.name = 'Income' AND s.name = 'Salary'
    ),
    'July salary Deutsche Bank'
),
(
    '2026-07-02',
    -12.50,
    'EUR',
    (SELECT id FROM persons WHERE name = 'Nikita'),
    (SELECT id FROM categories WHERE name = 'Food'),
    (
        SELECT s.id
        FROM subcategories s
        JOIN categories c ON c.id = s.category_id
        WHERE c.name = 'Food' AND s.name = 'Groceries'
    ),
    'REWE'
),
(
    '2026-07-03',
    -45.00,
    'EUR',
    (SELECT id FROM persons WHERE name = 'Nikita'),
    (SELECT id FROM categories WHERE name = 'Transport'),
    (
        SELECT s.id
        FROM subcategories s
        JOIN categories c ON c.id = s.category_id
        WHERE c.name = 'Transport' AND s.name = 'Public transport'
    ),
    'Monthly ticket VGF'
),
(
    '2026-07-05',
    -8.90,
    'EUR',
    (SELECT id FROM persons WHERE name = 'Nikita'),
    (SELECT id FROM categories WHERE name = 'Food'),
    (
        SELECT s.id
        FROM subcategories s
        JOIN categories c ON c.id = s.category_id
        WHERE c.name = 'Food' AND s.name = 'Coffee'
    ),
    'Starbucks with colleague'
),
(
    '2026-07-07',
    -650.00,
    'EUR',
    (SELECT id FROM persons WHERE name = 'Nikita'),
    (SELECT id FROM categories WHERE name = 'Housing'),
    (
        SELECT s.id
        FROM subcategories s
        JOIN categories c ON c.id = s.category_id
        WHERE c.name = 'Housing' AND s.name = 'Rent'
    ),
    'July rent'
),
(
    '2026-07-10',
    -35.20,
    'EUR',
    (SELECT id FROM persons WHERE name = 'Nikita'),
    (SELECT id FROM categories WHERE name = 'Utilities'),
    (
        SELECT s.id
        FROM subcategories s
        JOIN categories c ON c.id = s.category_id
        WHERE c.name = 'Utilities' AND s.name = 'Internet'
    ),
    'Vodafone monthly'
),
(
    '2026-07-12',
    150.00,
    'EUR',
    (SELECT id FROM persons WHERE name = 'Nikita'),
    (SELECT id FROM categories WHERE name = 'Income'),
    (
        SELECT s.id
        FROM subcategories s
        JOIN categories c ON c.id = s.category_id
        WHERE c.name = 'Income' AND s.name = 'Freelance'
    ),
    'Side project payment'
),
(
    '2026-07-14',
    -22.00,
    'EUR',
    (SELECT id FROM persons WHERE name = 'Nikita'),
    (SELECT id FROM categories WHERE name = 'Entertainment'),
    (
        SELECT s.id
        FROM subcategories s
        JOIN categories c ON c.id = s.category_id
        WHERE c.name = 'Entertainment' AND s.name = 'Cinema'
    ),
    'Weekend movie'
),
(
    '2026-07-15',
    -60.00,
    'EUR',
    (SELECT id FROM persons WHERE name = 'Nikita'),
    (SELECT id FROM categories WHERE name = 'Health'),
    (
        SELECT s.id
        FROM subcategories s
        JOIN categories c ON c.id = s.category_id
        WHERE c.name = 'Health' AND s.name = 'Pharmacy'
    ),
    'Apotheke'
),
(
    '2026-07-16',
    -15.00,
    'RUB',
    (SELECT id FROM persons WHERE name = 'Nikita'),
    (SELECT id FROM categories WHERE name = 'Subscriptions'),
    (
        SELECT s.id
        FROM subcategories s
        JOIN categories c ON c.id = s.category_id
        WHERE c.name = 'Subscriptions' AND s.name = 'Software'
    ),
    'Self-hosting VPS'
);

SELECT * FROM transactions;
SELECT * FROM subcategories;
SELECT * FROM categories;

delete from categories where id in (10)

update transactions SET category_id = 3 Where category_id = 10