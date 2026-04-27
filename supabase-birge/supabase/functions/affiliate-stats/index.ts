// supabase/functions/affiliate-stats/index.ts
// Получение статистики продажника

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

interface Payload {
  affiliate_id: string
  shop_id?: string
  period?: 'day' | 'week' | 'month' | 'all'
}

serve(async (req) => {
  try {
    const { affiliate_id, shop_id, period = 'all' } = await req.json() as Payload
    
    if (!affiliate_id) {
      return new Response(
        JSON.stringify({ error: 'Affiliate ID required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Формируем фильтр по периоду
    let dateFilter = ''
    if (period !== 'all') {
      const now = new Date()
      let startDate: Date
      
      switch (period) {
        case 'day':
          startDate = new Date(now.setHours(0, 0, 0, 0))
          break
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7))
          break
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1))
          break
        default:
          startDate = new Date(0)
      }
      
      dateFilter = `&created_at=gte.${startDate.toISOString()}`
    }

    // Получаем shop_affiliates данные
    const shopAffiliateFilter = shop_id 
      ? `&shop_id=eq.${shop_id}` 
      : ''
    
    const saResp = await fetch(
      `${supabaseUrl}/rest/v1/shop_affiliates?affiliate_id=eq.${affiliate_id}${shopAffiliateFilter}`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      }
    )
    const shopAffiliates = await saResp.json()

    // Получаем ссылки продажника
    const linksResp = await fetch(
      `${supabaseUrl}/rest/v1/affiliate_links?affiliate_id=eq.${affiliate_id}`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      }
    )
    const links = await linksResp.json()

    // Получаем заказы продажника
    const ordersResp = await fetch(
      `${supabaseUrl}/rest/v1/orders?affiliate_id=eq.${affiliate_id}${dateFilter}&order=created_at.desc`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      }
    )
    const orders = await ordersResp.json()

    // Получаем баланс
    const balanceResp = await fetch(
      `${supabaseUrl}/rest/v1/rpc/get_affiliate_balance?p_user_id=eq.${affiliate_id}`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      }
    )
    const balance = await balanceResp.json()

    // Подсчитываем статистику по заказам
    const totalOrders = orders.length
    const confirmedOrders = orders.filter((o: any) => o.status === 'confirmed').length
    const totalEarned = orders
      .filter((o: any) => o.status === 'confirmed')
      .reduce((sum: number, o: any) => sum + o.affiliate_commission, 0)
    
    const pendingEarned = orders
      .filter((o: any) => o.status === 'paid_escrow' || o.status === 'shipped' || o.status === 'delivered')
      .reduce((sum: number, o: any) => sum + o.affiliate_commission, 0)

    // Подсчитываем клики
    const totalClicks = links.reduce((sum: number, l: any) => sum + (l.clicks || 0), 0)
    const totalUniqueClicks = links.reduce((sum: number, l: any) => sum + (l.unique_clicks || 0), 0)

    // Формируем список заказов для фронта
    const formattedOrders = orders.map((o: any) => ({
      id: o.id,
      product_name: o.product_name,
      product_size: o.product_size,
      amount: o.subtotal,
      commission: o.affiliate_commission,
      status: o.status,
      created_at: o.created_at,
      confirmed_at: o.confirmed_at,
      tracking_number: o.tracking_number,
    }))

    // Формируем список ссылок
    const formattedLinks = links.map((l: any) => ({
      id: l.id,
      link_token: l.link_token,
      link_type: l.link_type,
      product_id: l.product_id,
      clicks: l.clicks,
      unique_clicks: l.unique_clicks,
      created_at: l.created_at,
      url: `https://birgesataiyq.kz/shop/${l.shop_id}?ref=${l.link_token}`,
    }))

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          total_orders: totalOrders,
          confirmed_orders: confirmedOrders,
          total_earned: totalEarned,
          pending_earned: pendingEarned,
          available_balance: balance?.available_balance || 0,
          total_clicks: totalClicks,
          total_unique_clicks: totalUniqueClicks,
          conversion_rate: totalClicks > 0 ? ((confirmedOrders / totalClicks) * 100).toFixed(1) : '0',
        },
        shops: shopAffiliates,
        links: formattedLinks,
        orders: formattedOrders,
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