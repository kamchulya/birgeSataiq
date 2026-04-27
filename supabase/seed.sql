-- =====================================================
-- seed.sql
-- Тестовые данные для разработки
-- =====================================================

-- Вставка тестового продавца
INSERT INTO users (id, phone, name, role, is_verified) VALUES 
('11111111-1111-1111-1111-111111111111', '+77001234567', 'Тестовый Продавец', 'seller', TRUE);

-- Вставка тестового продажника
INSERT INTO users (id, phone, name, role, is_verified) VALUES 
('22222222-2222-2222-2222-222222222222', '+77007654321', 'Тестовый Продажник', 'affiliate', TRUE);

-- Вставка тестового магазина
INSERT INTO shops (id, seller_id, name, slug, category, commission_percent, platform_fee_percent, is_active) VALUES 
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 
 '11111111-1111-1111-1111-111111111111', 
 'Bella Donna', 
 'bella-donna', 
 'Одежда и бельё', 
 10, 
 1.5, 
 TRUE);

-- Вставка категорий (если ещё не вставлены)
INSERT INTO categories (name, icon, slug) VALUES 
    ('Пеньюар', '👗', 'penyuare'),
    ('Бюстгальтер', '👙', 'byustgalter'),
    ('Комплект', '🩱', 'komplekt'),
    ('Трусы', '🩲', 'trusy'),
    ('Другое', '📦', 'other')
ON CONFLICT (name) DO NOTHING;

-- Вставка тестовых товаров
INSERT INTO products (id, shop_id, name, code, category_id, retail_price, wholesale_price, sizes, description, is_active) VALUES 
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 'Комплект Роза',
 'BD-001',
 (SELECT id FROM categories WHERE name = 'Комплект'),
 8500,
 5500,
 ARRAY['S', 'M', 'L'],
 'Нежный кружевной комплект из мягкого материала. Идеально сидит по фигуре.',
 TRUE),
 
('cccccccc-cccc-cccc-cccc-cccccccccccc',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 'Пеньюар Noir',
 'BD-002',
 (SELECT id FROM categories WHERE name = 'Пеньюар'),
 12000,
 7500,
 ARRAY['S', 'M', 'L', 'XL'],
 'Элегантный пеньюар из шёлкового атласа. Ощущение роскоши каждый день.',
 TRUE),
 
('dddddddd-dddd-dddd-dddd-dddddddddddd',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 'Бюстгальтер Lace',
 'BD-003',
 (SELECT id FROM categories WHERE name = 'Бюстгальтер'),
 4500,
 2800,
 ARRAY['75B', '80B', '80C', '85C', '85D'],
 'Французское кружево, мягкие косточки. Для тех кто ценит комфорт и стиль.',
 TRUE);

-- Связываем продажника с магазином
INSERT INTO shop_affiliates (shop_id, affiliate_id, custom_promo_code, personal_commission_percent, status) VALUES 
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 '22222222-2222-2222-2222-222222222222',
 'MASHA10',
 10,
 'active');

-- Создаём реферальную ссылку для продажника
INSERT INTO affiliate_links (shop_id, affiliate_id, link_token, link_type, clicks) VALUES 
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 '22222222-2222-2222-2222-222222222222',
 'masha_referral_2025',
 'shop',
 0);

-- Создаём тестовое уведомление
INSERT INTO notifications (user_id, type, title, message, is_read) VALUES 
('22222222-2222-2222-2222-222222222222',
 'welcome',
 'Добро пожаловать в БіргеСатайық!',
 'Вы стали продажником магазина Bella Donna. Ваша ссылка готова — делитесь и зарабатывайте!',
 FALSE);