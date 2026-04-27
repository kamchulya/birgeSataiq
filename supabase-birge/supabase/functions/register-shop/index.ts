// supabase/functions/register-shop/index.ts
// Регистрация магазина продавцом

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

interface Payload {
  user_id: string
  shop_name: string
  category: string
  tg_handle: string
  commission_percent: number
}

serve(async (req) => {
  try {
    const { user_id, shop_name, category, tg_handle, commission_percent } = await req.json() as Payload
    
    if (!user_id || !shop_name) {
      return new Response(
        JSON.stringify({ error: 'User ID and shop name required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Генерируем slug из названия магазина
    const slug = generateSlug(shop_name)

    // Проверяем, существует ли уже магазин у пользователя
    const existingShop = await fetch(`${supabaseUrl}/rest/v1/shops?seller_id=eq.${user_id}`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    })
    const existing = await existingShop.json()
    
    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Shop already exists for this user' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Обновляем пользователя (добавляем TG и роль seller)
    await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({
        tg_handle: tg_handle || null,
        role: 'seller',
      }),
    })

    // Создаём магазин
    const response = await fetch(`${supabaseUrl}/rest/v1/shops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({
        seller_id: user_id,
        name: shop_name,
        slug: slug,
        category: category,
        commission_percent: commission_percent || 10,
      }),
    })

    const shop = await response.json()
    const shopId = shop[0].id

    return new Response(
      JSON.stringify({ 
        success: true, 
        shop_id: shopId,
        shop_name: shop_name,
        shop_slug: slug,
        shop_url: `https://birgesataiyq.kz/${slug}`
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

function generateSlug(name: string): string {
  const translit: Record<string, string> = {
    'а': 'a', 'ә': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'ғ': 'g',
    'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
    'й': 'y', 'к': 'k', 'қ': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
    'ң': 'n', 'о': 'o', 'ө': 'o', 'п': 'p', 'р': 'r', 'с': 's',
    'т': 't', 'у': 'u', 'ұ': 'u', 'ү': 'u', 'ф': 'f', 'х': 'kh',
    'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ы': 'y', 'і': 'i',
    'э': 'e', 'ю': 'yu', 'я': 'ya'
  }
  
  return name
    .toLowerCase()
    .split('')
    .map(c => translit[c] || (/[a-z0-9]/i.test(c) ? c : ''))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}