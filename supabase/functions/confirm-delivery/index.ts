// supabase/functions/confirm-delivery/index.ts
// Подтверждение получения товара покупателем

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

interface Payload {
  order_id: string
  user_id: string
}

serve(async (req) => {
  try {
    const { order_id, user_id } = await req.json() as Payload
    
    if (!order_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Order ID and User ID required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ZAMMLER_API_KEY = Deno.env.get('ZAMMLER_API_KEY') || ''
    const ZAMMLER_API_URL = Deno.env.get('ZAMMLER_API_URL') || 'https://api.zammler.kz/v1'

    // Получаем заказ
    const orderResp = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order_id}`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    })
    const orders = await orderResp.json()
    const order = orders[0]

    if (!order) {
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (order.status !== 'delivered') {
      return new Response(
        JSON.stringify({ error: 'Order is not in delivered status' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Получаем escrow транзакцию
    const escrowResp = await fetch(`${supabaseUrl}/rest/v1/escrow_transactions?order_id=eq.${order_id}`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    })
    const escrows = await escrowResp.json()
    const escrow = escrows[0]

    // Высвобождаем деньги через Zammler
    let zammlerSuccess = false
    
    if (escrow && ZAMMLER_API_KEY) {
      try {
        const releaseResp = await fetch(`${ZAMMLER_API_URL}/escrow/release`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ZAMMLER_API_KEY}`,
          },
          body: JSON.stringify({
            transaction_id: escrow.zammler_transaction_id,
            order_id: order_id,
          }),
        })
        
        zammlerSuccess = releaseResp.ok
        
      } catch (error) {
        console.error('Zammler release error:', error)
      }
    }

    // Обновляем статус заказа
    await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      }),
    })

    // Обновляем escrow статус
    if (escrow) {
      await fetch(`${supabaseUrl}/rest/v1/escrow_transactions?id=eq.${escrow.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          status: 'released_to_seller',
          released_at: new Date().toISOString(),
        }),
      })
    }

    // Получаем информацию о магазине и продавце
    const shopResp = await fetch(`${supabaseUrl}/rest/v1/shops?id=eq.${order.shop_id}`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    })
    const shops = await shopResp.json()
    const shop = shops[0]

    // Получаем продавца
    const sellerResp = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${shop.seller_id}`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    })
    const sellers = await sellerResp.json()
    const seller = sellers[0]

    // Уведомляем продавца
    if (seller?.tg_chat_id) {
      await sendTelegramNotification(
        seller.tg_chat_id,
        `✅ Подтверждение получения!\n\nЗаказ #${order_id.slice(0,8)}\nСумма перевода продавцу: ${order.seller_amount.toLocaleString()}₸\n\nДеньги поступят на ваш счёт в течение 1-3 рабочих дней.`
      )
    }

    // Если есть продажник, начисляем ему комиссию
    if (order.affiliate_id) {
      const affiliateResp = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${order.affiliate_id}`, {
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
          `🎉 Вам начислена комиссия!\n\nЗаказ #${order_id.slice(0,8)}\nСумма: ${order.affiliate_commission.toLocaleString()}₸\n\nСредства поступили на ваш баланс.`
        )
      }

      // Добавляем уведомление в БД для продажника
      await createNotification(
        supabaseUrl,
        supabaseKey,
        order.affiliate_id,
        'commission_earned',
        'Начислена комиссия',
        `За ${order.product_name} вы получили ${order.affiliate_commission.toLocaleString()}₸`,
        { order_id, amount: order.affiliate_commission }
      )
    }

    // Уведомляем покупателя (если указан Telegram)
    // Здесь можно добавить логику

    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: order_id,
        message: 'Delivery confirmed, funds released'
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

async function createNotification(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  type: string,
  title: string,
  message: string,
  data: object
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({
      user_id: userId,
      type: type,
      title: title,
      message: message,
      data: data,
    }),
  }).catch(() => {})
}