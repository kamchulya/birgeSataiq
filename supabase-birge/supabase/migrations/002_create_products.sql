-- =====================================================
-- 002_create_products.sql
-- =====================================================

-- Категории
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    icon VARCHAR(10),
    slug VARCHAR(50) UNIQUE NOT NULL
);

-- Вставляем базовые категории
INSERT INTO categories (name, icon, slug) VALUES
    ('Пеньюар', '👗', 'penyuare'),
    ('Бюстгальтер', '👙', 'byustgalter'),
    ('Комплект', '🩱', 'komplekt'),
    ('Трусы', '🩲', 'trusy'),
    ('Другое', '📦', 'other');

-- Товары
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50),
    category_id INTEGER REFERENCES categories(id),
    retail_price INTEGER NOT NULL,
    wholesale_price INTEGER,
    sizes TEXT[],
    description TEXT,
    img_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    views INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_shop_id ON products(shop_id);
CREATE INDEX idx_products_is_active ON products(is_active);