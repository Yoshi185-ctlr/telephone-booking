const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = JSON.parse(event.body || '{}');
    const { startAt, name, customerType, paymentMethod, 
          } = body;

    if (!startAt || !name || !customerType || !paymentMethod) {
      return json(400, { error: '必須項目が不足しています' });
    }
    if (!['新規','会員'].includes(customerType)) return json(400, { error: '新規/会員の値が不正です' });
    if (!['クレジットカード','振込'].includes(paymentMethod)) return json(400, { error: '支払い方法の値が不正です' });

    const startDate = new Date(startAt);
    if (isNaN(startDate.getTime())) return json(400, { error: '開始時刻が不正です' });

    // JSTに変換
    const startJst = new Date(startDate.getTime() + 9 * 60 * 60 * 1000);

    // 30分刻みチェック（00 or 30）
    const minute = startJst.getMinutes();
    if (!(minute === 0 || minute === 30)) return json(400, { error: '予約は30分毎のみ可能です' });

    // 受付時間：12:00〜翌5:00（JST）
    const hour = startJst.getHours();
    const inWindow =
      (hour >= 12 && hour <= 23) ||
      (hour >= 0 && hour <= 4) ||
      (hour === 5 && minute === 0);
    if (!inWindow) return json(400, { error: '受付時間外です（12:00〜翌5:00）' });

    // 当日・翌日のみ（JST）
    const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const startYMD = ymd(startJst);
    const todayYMD = ymd(nowJst);
    const tom = new Date(nowJst); tom.setDate(tom.getDate() + 1);
    const tomorrowYMD = ymd(tom);
    if (!(startYMD === todayYMD || startYMD === tomorrowYMD)) {
      return json(400, { error: '予約は当日・翌日のみ可能です' });
    }

    // Supabaseへ保存（重複枠はDBのuniqueで弾く）
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error: insErr } = await supabase
      .from('phone_bookings')
      .insert([{
        start_at: startDate.toISOString(), // UTCで保存
        name: name.trim(),
        customer_type: customerType,
        payment_method: paymentMethod,
      }]);

    if (insErr) {
      const msg = String(insErr.message || '');
      if (msg.toLowerCase().includes('duplicate') || msg.includes('unique')) {
        return json(409, { error: 'その枠は既に予約されています' });
      }
      return json(500, { error: '予約に失敗しました' });
    }

    // LINE通知（トークン＆送信先userIdがある時だけ送る）
    const endJst = new Date(startJst.getTime() + 20 * 60 * 1000);
    const text = buildLineText({
      paymentMethod,
      start: hhmm(startJst),
      end: hhmm(endJst),
      customerType,
      name: name.trim(),
      lineUrl: process.env.LINE_OFFICIAL_URL || 'https://line.me/R/ti/p/@004ubxal'
    });

    await pushLine(process.env.LINE_NOTIFY_USER_ID, text);

    return json(200, {
      ok: true,
      lineOfficialUrl: process.env.LINE_OFFICIAL_URL || 'https://line.me/R/ti/p/@004ubxal'
    });
  } catch (e) {
    return json(500, { error: 'server error' });
  }
};

function buildLineText({ paymentMethod, start, end, customerType, name, lineUrl }) {
  return `【ステータス】通常
【支払い方法】${paymentMethod}
【受付店舗】本店
【開始時間】${start}
【終了時間】${end}
【新規/会員】${customerType}
【お客様名】${name}
【予約方法】DM
【利用エリア】未決定
【合流方法】DMにて
【詳細な場所】未決定
【セラピスト】YUKI(ﾕｳｷ)
【指名】
【コース】テレフォンコース
【合計時間】20分
【交通費】
【備考】
テレフォン
 
合計金額 ¥3,000
${telLine}

上記内容をコピー&ペーストし、
電話番号を添え、下記、店舗の公式LINEまでお送り頂いて確定と
なります。
${lineUrl}`;
}

async function pushLine(toUserId, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !toUserId) return;

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: toUserId,
      messages: [{ type: 'text', text }]
    })
  });
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function hhmm(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}
