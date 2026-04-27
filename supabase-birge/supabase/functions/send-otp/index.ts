// supabase/functions/send-otp/index.ts
// Отправка SMS с кодом подтверждения

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SMS_PROVIDER = Deno.env.get('SMS_PROVIDER') || 'simulator'
const SMS_API_KEY = Deno.env.get('SMS_API_KEY') || ''
const SMS_API_SECRET = Deno.env.get('SMS_API_SECRET') || ''

interface Payload {
  phone: string
}

serve(async (req) => {
  try {
    const { phone } = await req.json() as Payload
    
    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Phone number required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Генерируем 4-значный код
    const code = Math.floor(1000 + Math.random() * 9000).toString()
    
    // Сохраняем код в Supabase (срок жизни 5 минут)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 5)
    
    await fetch(`${supabaseUrl}/rest/v1/otp_codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({
        phone,
        code,
        expires_at: expiresAt.toISOString(),
      }),
    })

    // Отправляем SMS через провайдера
    let smsSent = false
    
    if (SMS_PROVIDER === 'twilio') {
      // Twilio интеграция
      const accountSid = SMS_API_KEY
      const authToken = SMS_API_SECRET
      const from = Deno.env.get('TWILIO_PHONE') || '+1234567890'
      
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
      
      const formData = new URLSearchParams()
      formData.append('To', phone)
      formData.append('From', from)
      formData.append('Body', `Ваш код подтверждения БіргеСатайық: ${code}`)
      
      const twilioResp = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      })
      
      smsSent = twilioResp.ok
      
    } else if (SMS_PROVIDER === 'isms') {
      // iSMS.kz для Казахстана
      const response = await fetch('https://api.isms.kz/v1/message/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SMS_API_KEY}`,
        },
        body: JSON.stringify({
          to: phone,
          text: `Ваш код: ${code}. Никому не сообщайте. БіргеСатайық`,
          from: 'BirgeSatayiq',
        }),
      })
      smsSent = response.ok
      
    } else {
      // Режим симуляции (для разработки)
      console.log(`[SMS SIMULATOR] Код для ${phone}: ${code}`)
      smsSent = true
    }

    if (!smsSent && SMS_PROVIDER !== 'simulator') {
      return new Response(
        JSON.stringify({ error: 'Failed to send SMS' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Code sent' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})