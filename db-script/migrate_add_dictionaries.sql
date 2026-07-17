BEGIN;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_subcategory;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_person_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_category_fkey;
ALTER TABLE subcategories DROP CONSTRAINT IF EXISTS subcategories_category_name_fkey;
ALTER TABLE subcategories DROP CONSTRAINT IF EXISTS uq_subcategories_category_name;

ALTER TABLE categories ADD COLUMN id BIGSERIAL;
ALTER TABLE persons ADD COLUMN id BIGSERIAL;
ALTER TABLE subcategories ADD COLUMN category_id BIGINT;

UPDATE subcategories s
SET category_id = c.id
FROM categories c
WHERE c.name = s.category_name;

ALTER TABLE categories DROP CONSTRAINT categories_pkey;
ALTER TABLE persons DROP CONSTRAINT persons_pkey;

ALTER TABLE categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE persons ADD CONSTRAINT persons_pkey PRIMARY KEY (id);
ALTER TABLE categories ADD CONSTRAINT uq_categories_name UNIQUE (name);
ALTER TABLE persons ADD CONSTRAINT uq_persons_name UNIQUE (name);

ALTER TABLE subcategories ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE subcategories
    ADD CONSTRAINT fk_subcategories_category_id FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE subcategories
    ADD CONSTRAINT uq_subcategories_category_id_name UNIQUE (category_id, name);

ALTER TABLE transactions ADD COLUMN person_id BIGINT;
ALTER TABLE transactions ADD COLUMN category_id BIGINT;
ALTER TABLE transactions ADD COLUMN subcategory_id BIGINT;

UPDATE transactions t
SET person_id = p.id
FROM persons p
WHERE t.person = p.name;

UPDATE transactions t
SET category_id = c.id
FROM categories c
WHERE t.category = c.name;

UPDATE transactions t
SET subcategory_id = s.id
FROM subcategories s
JOIN categories c ON c.id = s.category_id
WHERE t.category = c.name
  AND t.sub_category = s.name;

ALTER TABLE transactions ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE transactions
    ADD CONSTRAINT fk_transactions_person_id FOREIGN KEY (person_id) REFERENCES persons(id);
ALTER TABLE transactions
    ADD CONSTRAINT fk_transactions_category_id FOREIGN KEY (category_id) REFERENCES categories(id);
ALTER TABLE transactions
    ADD CONSTRAINT fk_transactions_subcategory_id FOREIGN KEY (subcategory_id) REFERENCES subcategories(id);

DROP INDEX IF EXISTS idx_transactions_category;
CREATE INDEX idx_transactions_category_id ON transactions (category_id);
CREATE INDEX idx_transactions_person_id ON transactions (person_id);
CREATE INDEX idx_transactions_subcategory_id ON transactions (subcategory_id);
DROP INDEX IF EXISTS idx_subcategories_category_name;
CREATE INDEX idx_subcategories_category_id ON subcategories (category_id);

ALTER TABLE transactions DROP COLUMN person;
ALTER TABLE transactions DROP COLUMN category;
ALTER TABLE transactions DROP COLUMN sub_category;
ALTER TABLE subcategories DROP COLUMN category_name;

COMMIT;

