-- =====================================================
-- 004_create_orders_and_escrow.sql
-- =====================================================

-- Статусы заказов
CREATE TYPE order_status AS ENUM (
    'pending',      
    'paid_escrow',  
    'processing',   
    'shipped',      
    'delivered',    
    'confirmed',    
    'cancelled',    
    'refunded'      
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
    auto_confirm_deadline TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Эскроу транзакции
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

-- Запросы на вывод денег
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