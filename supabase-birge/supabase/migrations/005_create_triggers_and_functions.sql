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

-- Триггеры
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shops_updated_at BEFORE UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Функция: авто-расчёт комиссий
CREATE OR REPLACE FUNCTION calculate_order_commissions()
RETURNS TRIGGER AS $$
DECLARE
    shop_commission INTEGER;
    platform_fee DECIMAL;
BEGIN
    SELECT personal_commission_percent, s.platform_fee_percent
    INTO shop_commission, platform_fee
    FROM shop_affiliates sa
    JOIN shops s ON s.id = sa.shop_id
    WHERE sa.shop_id = NEW.shop_id AND sa.affiliate_id = NEW.affiliate_id;
    
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

-- Функция: обновление статистики продажника
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

-- Функция создания уведомления
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

-- Функция получения баланса продажника
CREATE OR REPLACE FUNCTION get_affiliate_balance(p_user_id UUID)
RETURNS TABLE(total_earned BIGINT, pending_withdrawals BIGINT, available_balance BIGINT) AS $$
DECLARE
    total_earned BIGINT;
    pending_withdrawals BIGINT;
BEGIN
    SELECT COALESCE(SUM(total_earned), 0) INTO total_earned
    FROM shop_affiliates WHERE affiliate_id = p_user_id;
    
    SELECT COALESCE(SUM(amount), 0) INTO pending_withdrawals
    FROM withdrawal_requests 
    WHERE user_id = p_user_id AND status = 'pending';
    
    RETURN QUERY SELECT total_earned, pending_withdrawals, total_earned - pending_withdrawals;
END;
$$ LANGUAGE plpgsql;