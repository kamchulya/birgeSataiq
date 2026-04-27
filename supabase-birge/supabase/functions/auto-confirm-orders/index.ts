// supabase/functions/auto-confirm-orders/index.ts
// Cron-функция для авто-подтверждения заказов через 7 дней
// Запускать каждый день через cron: 0 0 * * *

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ZAMMLER_API_KEY = Deno.env.get('ZAMMLER_API_KEY') || ''
    const ZAMMLER_API_URL = Deno.env.get('ZAMMLER_API_URL') || 'https://api.zammler.kz/v1'

    // Находим заказы со статусом 'delivered' старше 7 дней
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    // Получаем заказы, где статус delivered и confirmed_at пустой
    // В реальной реализации нужно получать заказы, у которых auto_confirm_deadline < NOW()
    const ordersResp = await fetch(
      `${supabaseUrl}/rest/v1/orders?status=eq.delivered&auto_confirm_deadline=lt.${new Date().toISOString()}`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      }
    )
    const orders = await ordersResp.json()

    console.log(`Found ${orders.length} orders to auto-confirm`)

    for (const order of orders) {
      // Получаем escrow транзакцию
      const escrowResp = await fetch(
        `${supabaseUrl}/rest/v1/escrow_transactions?order_id=eq.${order.id}`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
        }
      )
      const escrows = await escrowResp.json()
      const escrow = escrows[0]

      // Высвобождаем деньги через Zammler
      if (escrow && ZAMMLER_API_KEY) {
        try {
          await fetch(`${ZAMMLER_API_URL}/escrow/release`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ZAMMLER_API_KEY}`,
            },
            body: JSON.stringify({
              transaction_id: escrow.zammler_transaction_id,
              order_id: order.id,
              auto_confirm: true,
            }),
          })
        } catch (error) {
          console.error(`Zammler error for order ${order.id}:`, error)
        }
      }

      // Обновляем статус заказа
      await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order.id}`, {
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

      // Уведомляем продавца
      const shopResp = await fetch(`${supabaseUrl}/rest/v1/shops?id=eq.${order.shop_id}`, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      })
      const shops = await shopResp.json()
      const shop = shops[0]

      if (shop) {
        const sellerResp = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${shop.seller_id}`, {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
        })
        const sellers = await sellerResp.json()
        const seller = sellers[0]

        if (seller?.tg_chat_id) {
          await sendTelegramNotification(
            seller.tg_chat_id,
            `✅ Авто-подтверждение заказа #${order.id.slice(0,8)}\n\nПокупатель не подтвердил получение в течение 7 дней. Деньги автоматически переведены продавцу: ${order.seller_amount.toLocaleString()}₸`
          )
        }
      }

      // Уведомляем продажника
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
            `💰 Комиссия зачислена (авто-подтверждение)\n\nЗаказ #${order.id.slice(0,8)}\nСумма: ${order.affiliate_commission.toLocaleString()}₸`
          )
        }

        // Создаём уведомление в БД
        await createNotification(
          supabaseUrl,
          supabaseKey,
          order.affiliate_id,
          'commission_earned',
          'Начислена комиссия (авто)',
          `Заказ #${order.id.slice(0,8)} — ${order.affiliate_commission.toLocaleString()}₸`,
          { order_id: order.id, amount: order.affiliate_commission, auto_confirm: true }
        )
      }
    }

    return new Response(
      JSON.stringify({ success: true, confirmed_orders: orders.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Auto-confirm error:', error)
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