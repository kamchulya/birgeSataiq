// supabase/functions/create-order/index.ts
// Создание заказа с эскроу через Zammler

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

interface OrderItem {
  product_id: string
  product_name: string
  product_size: string
  price: number
  quantity: number
}

interface Payload {
  buyer_name: string
  buyer_phone: string
  buyer_address: string
  shop_id: string
  affiliate_id?: string
  affiliate_link_id?: string
  items: OrderItem[]
}

serve(async (req) => {
  try {
    const payload = await req.json() as Payload
    
    const { buyer_name, buyer_phone, buyer_address, shop_id, affiliate_id, affiliate_link_id, items } = payload
    
    if (!buyer_name || !buyer_phone || !shop_id || !items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ZAMMLER_API_KEY = Deno.env.get('ZAMMLER_API_KEY') || ''
    const ZAMMLER_API_URL = Deno.env.get('ZAMMLER_API_URL') || 'https://api.zammler.kz/v1'

    // Вычисляем суммы
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    
    // Получаем комиссию магазина
    const shopResp = await fetch(`${supabaseUrl}/rest/v1/shops?id=eq.${shop_id}`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    })
    const shops = await shopResp.json()
    const shop = shops[0]
    
    const commissionPercent = shop.commission_percent || 10
    const platformFeePercent = parseFloat(shop.platform_fee_percent) || 1.5
    
    const affiliateCommission = Math.round(subtotal * commissionPercent / 100)
    const platformFee = Math.round(subtotal * platformFeePercent / 100)
    const sellerAmount = subtotal - affiliateCommission - platformFee

    // Создаём заказ
    const firstItem = items[0]
    const orderResp = await fetch(`${supabaseUrl}/rest/v1/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({
        shop_id,
        product_id: firstItem.product_id,
        affiliate_id: affiliate_id || null,
        affiliate_link_id: affiliate_link_id || null,
        buyer_name,
        buyer_phone,
        buyer_address,
        product_name: firstItem.product_name,
        product_size: firstItem.product_size,
        product_price: firstItem.price,
        quantity: items.reduce((sum, i) => sum + i.quantity, 0),
        subtotal,
        affiliate_commission: affiliateCommission,
        platform_fee: platformFee,
        seller_amount: sellerAmount,
        total: subtotal,
        status: 'pending',
      }),
    })
    
    const orderResult = await orderResp.json()
    const orderId = orderResult[0].id

    // Создаём эскроу транзакцию через Zammler
    let escrowId = null
    let paymentUrl = null
    
    if (ZAMMLER_API_KEY) {
      try {
        const zammlerResp = await fetch(`${ZAMMLER_API_URL}/escrow/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ZAMMLER_API_KEY}`,
          },
          body: JSON.stringify({
            order_id: orderId,
            amount: subtotal,
            buyer_phone,
            buyer_name,
            seller_phone: shop.seller_phone,
            return_url: `https://birgesataiyq.kz/order/${orderId}/status`,
          }),
        })
        
        const zammlerData = await zammlerResp.json()
        paymentUrl = zammlerData.payment_url
        
        // Сохраняем escrow транзакцию
        await fetch(`${supabaseUrl}/rest/v1/escrow_transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({
            order_id: orderId,
            zammler_transaction_id: zammlerData.transaction_id,
            amount: subtotal,
            status: 'frozen',
          }),
        })
        
        // Обновляем статус заказа
        await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({ status: 'paid_escrow' }),
        })
        
        escrowId = zammlerData.transaction_id
        
      } catch (zammlerError) {
        console.error('Zammler error:', zammlerError)
      }
    }

    // Отправляем уведомление продавцу в Telegram
    await sendTelegramNotification(
      shop.seller_tg_chat_id,
      `🛍️ Новый заказ!\n\nТовар: ${firstItem.product_name}\nСумма: ${subtotal.toLocaleString()}₸\nПокупатель: ${buyer_name}\n\nПерейдите в кабинет для обработки.`
    )

    // Если есть продажник, уведомляем его
    if (affiliate_id) {
      const affiliateResp = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${affiliate_id}`, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      })
      const affiliates = await affiliateResp.json()
      const affiliate = affiliates[0]
      
      if (affiliate?.tg_chat_id) {
        await sendTelegramNotification(
          affiliate.tg_chat_id,
          `💰 Новый заказ по вашей ссылке!\n\nТовар: ${firstItem.product_name}\nВаша комиссия: ${affiliateCommission.toLocaleString()}₸\n\nКак только покупатель подтвердит получение, деньги поступят на ваш баланс.`
        )
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: orderId,
        payment_url: paymentUrl,
        escrow_id: escrowId,
        amount: subtotal
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

async function sendTelegramNotification(chatId: number | null, message: string): Promise<void> {
  if (!chatId) return
  
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!botToken) return
  
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  }).catch(() => {})
}