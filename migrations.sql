-- =====================================================
-- 001_create_users_and_shops.sql
-- =====================================================

-- Включаем расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Пользователи (единая таблица для продавцов и продажников)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'seller', 'affiliate', 'admin')),
    tg_handle VARCHAR(100),
    tg_chat_id BIGINT,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Магазины
CREATE TABLE shops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50),
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    commission_percent INT DEFAULT 10 CHECK (commission_percent BETWEEN 3 AND 30),
    platform_fee_percent DECIMAL(5,2) DEFAULT 1.5,
    is_active BOOLEAN DEFAULT TRUE,
    settings JSONB DEFAULT '{"notifications": true, "auto_confirm_days": 7}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_shops_slug ON shops(slug);
CREATE INDEX idx_shops_seller_id ON shops(seller_id);

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

-- =====================================================
-- 003_create_affiliate_links.sql
-- =====================================================

-- Связи продажников с магазинами
CREATE TABLE shop_affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
    affiliate_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    custom_promo_code VARCHAR(50),
    personal_commission_percent INTEGER,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'pending')),
    total_clicks INT DEFAULT 0,
    total_sales INT DEFAULT 0,
    total_earned INT DEFAULT 0,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(shop_id, affiliate_id)
);

-- Ссылки продажников (уникальные для каждого продукта или магазина в целом)
CREATE TABLE affiliate_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
    affiliate_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    link_token VARCHAR(100) UNIQUE NOT NULL,
    link_type VARCHAR(20) DEFAULT 'shop' CHECK (link_type IN ('shop', 'product')),
    clicks INT DEFAULT 0,
    unique_clicks INT DEFAULT 0,
    last_click_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_affiliate_links_token ON affiliate_links(link_token);
CREATE INDEX idx_affiliate_links_affiliate_id ON affiliate_links(affiliate_id);
CREATE INDEX idx_shop_affiliates_affiliate_id ON shop_affiliates(affiliate_id);

-- =====================================================
-- 004_create_orders_and_escrow.sql
-- =====================================================

-- Статусы заказов
CREATE TYPE order_status AS ENUM (
    'pending',      -- ожидает оплаты
    'paid_escrow',  -- оплачено, деньги в эскроу
    'processing',   -- продавец обрабатывает
    'shipped',      -- отправлено
    'delivered',    -- доставлено (ждёт подтверждения)
    'confirmed',    -- подтверждено покупателем
    'cancelled',    -- отменено
    'refunded'      -- возвращено
);

-- Заказы
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) NOT NULL,
    product_id UUID REFERENCES products(id),
    affiliate_id UUID REFERENCES users(id),
    affiliate_link_id UUID REFERENCES affiliate_links(id),
    buyer_name VARCHAR(100) NOT NULL,
    buyer_phone VARCHAR(20) NOT NULL,
    buyer_address TEXT,
    product_name VARCHAR(200) NOT NULL,
    product_size VARCHAR(20),
    product_price INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    subtotal INTEGER NOT NULL,
    affiliate_commission INTEGER NOT NULL,
    platform_fee INTEGER NOT NULL,
    seller_amount INTEGER NOT NULL,
    total INTEGER NOT NULL,
    status order_status DEFAULT 'pending',
    tracking_number VARCHAR(100),
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    auto_confirm_deadline TIMESTAMPTZ,  -- через 7 дней после delivered
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Эскроу транзакции (Zammler интеграция)
CREATE TABLE escrow_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) NOT NULL,
    zammler_transaction_id VARCHAR(100),
    amount INTEGER NOT NULL,
    status VARCHAR(30) DEFAULT 'frozen' CHECK (status IN ('frozen', 'released_to_seller', 'released_to_affiliate', 'fee_taken', 'refunded')),
    frozen_at TIMESTAMPTZ DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    metadata JSONB
);

-- Запросы на вывод денег продажниками
CREATE TABLE withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    shop_id UUID REFERENCES shops(id),
    amount INTEGER NOT NULL,
    card_number VARCHAR(50),
    phone_for_transfer VARCHAR(20),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Уведомления
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    type VARCHAR(30) NOT NULL,
    title VARCHAR(200),
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_affiliate_id ON orders(affiliate_id);
CREATE INDEX idx_orders_shop_id ON orders(shop_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_escrow_order_id ON escrow_transactions(order_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);
CREATE INDEX idx_withdrawal_requests_status ON withdrawal_requests(status);

-- =====================================================
-- 005_create_triggers_and_functions.sql
-- =====================================================

-- Функция обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры на все таблицы
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shops_updated_at BEFORE UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Функция: авто-расчёт комиссий при создании заказа
CREATE OR REPLACE FUNCTION calculate_order_commissions()
RETURNS TRIGGER AS $$
DECLARE
    shop_commission INTEGER;
    platform_fee DECIMAL;
BEGIN
    -- Получаем комиссию продажника из shop_affiliates
    SELECT personal_commission_percent, s.platform_fee_percent
    INTO shop_commission, platform_fee
    FROM shop_affiliates sa
    JOIN shops s ON s.id = sa.shop_id
    WHERE sa.shop_id = NEW.shop_id AND sa.affiliate_id = NEW.affiliate_id;
    
    -- Если комиссия не задана персонально, берём из магазина
    IF shop_commission IS NULL THEN
        SELECT commission_percent, platform_fee_percent 
        INTO shop_commission, platform_fee
        FROM shops WHERE id = NEW.shop_id;
    END IF;
    
    NEW.affiliate_commission := ROUND(NEW.subtotal * shop_commission / 100);
    NEW.platform_fee := ROUND(NEW.subtotal * platform_fee / 100);
    NEW.seller_amount := NEW.subtotal - NEW.affiliate_commission - NEW.platform_fee;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_commissions_before_insert
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION calculate_order_commissions();

-- Функция: обновление статистики продажника при подтверждении заказа
CREATE OR REPLACE FUNCTION update_affiliate_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
        UPDATE shop_affiliates
        SET total_sales = total_sales + 1,
            total_earned = total_earned + NEW.affiliate_commission
        WHERE shop_id = NEW.shop_id AND affiliate_id = NEW.affiliate_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_affiliate_on_confirm
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_affiliate_stats();

-- Функция: создание уведомления
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type VARCHAR,
    p_title VARCHAR,
    p_message TEXT,
    p_data JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (p_user_id, p_type, p_title, p_message, p_data)
    RETURNING id INTO notification_id;
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;