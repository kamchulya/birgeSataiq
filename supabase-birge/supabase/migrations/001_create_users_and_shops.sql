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