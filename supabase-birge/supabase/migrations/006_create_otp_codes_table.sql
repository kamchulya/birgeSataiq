-- =====================================================
-- 006_create_otp_codes_table.sql
-- Таблица для хранения OTP кодов подтверждения
-- =====================================================

-- Таблица OTP кодов
CREATE TABLE IF NOT EXISTS otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX idx_otp_codes_phone ON otp_codes(phone);
CREATE INDEX idx_otp_codes_expires_at ON otp_codes(expires_at);

-- Автоматическая очистка старых кодов (через 10 минут)
CREATE OR REPLACE FUNCTION cleanup_expired_otp()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM otp_codes WHERE expires_at < NOW() - INTERVAL '10 minutes';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Запускаем очистку при каждой вставке
CREATE TRIGGER trigger_cleanup_otp
AFTER INSERT ON otp_codes
EXECUTE FUNCTION cleanup_expired_otp();