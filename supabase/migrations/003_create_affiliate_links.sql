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