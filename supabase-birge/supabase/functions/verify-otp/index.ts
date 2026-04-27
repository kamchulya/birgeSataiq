// supabase/functions/verify-otp/index.ts
// Проверка кода подтверждения

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

interface Payload {
  phone: string
  code: string
}

serve(async (req) => {
  try {
    const { phone, code } = await req.json() as Payload
    
    if (!phone || !code) {
      return new Response(
        JSON.stringify({ error: 'Phone and code required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Ищем код в БД
    const response = await fetch(`${supabaseUrl}/rest/v1/otp_codes?phone=eq.${phone}&code=eq.${code}&expires_at=gt.${new Date().toISOString()}`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    })

    const codes = await response.json()

    if (!codes || codes.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired code' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Удаляем использованный код
    await fetch(`${supabaseUrl}/rest/v1/otp_codes?id=eq.${codes[0].id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    })

    // Проверяем, существует ли пользователь
    const userResp = await fetch(`${supabaseUrl}/rest/v1/users?phone=eq.${phone}`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    })

    const users = await userResp.json()
    let userId: string

    if (!users || users.length === 0) {
      // Создаём нового пользователя
      const createResp = await fetch(`${supabaseUrl}/rest/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          phone,
          is_verified: true,
          role: 'user',
        }),
      })
      const newUser = await createResp.json()
      userId = newUser[0].id
    } else {
      userId = users[0].id
      // Обновляем статус верификации
      await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({ is_verified: true }),
      })
    }

    // Генерируем JWT токен для фронта
    const jwt = await createJWT(userId, phone)

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: userId,
        token: jwt,
        is_new_user: !users || users.length === 0
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

async function createJWT(userId: string, phone: string): Promise<string> {
  // В реальном Supabase используйте built-in JWT
  // Здесь упрощённая версия
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = { 
    sub: userId, 
    phone, 
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 дней
  }
  
  const encoder = new TextEncoder()
  const data = `${btoa(JSON.stringify(header))}.${btoa(JSON.stringify(payload))}`
  const key = Deno.env.get('SUPABASE_JWT_SECRET') || 'your-secret-key'
  const signature = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), encoder.encode(data))
  
  return `${data}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`
}