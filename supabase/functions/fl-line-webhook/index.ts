// fl-line-webhook：LINE Messaging API Webhook（驗簽 → 歡迎訊息 / AI 回覆 / 急症提示）
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const FL_SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const FL_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FL_AI_MODEL = 'gpt-4o-mini';
const FL_OA_NAME = 'AI專注訓練器';
const FL_TONE = '溫暖、清楚、簡短；不做醫療診斷，遇到急症請使用者立即就醫。';
const FL_URGENT_WORDS = ['胸痛', '胸悶', '呼吸困難', '喘不過氣', '昏倒', '意識不清', '中風', '大量出血', '想自殺', '自殺'];
const FL_URGENT_REPLY = '你描述的狀況可能需要緊急處理，請立即撥打 119 或前往最近的急診，不要等待。若有自傷念頭，請撥 1925 安心專線。';

const flDb = createClient(FL_SUPABASE_URL, FL_SERVICE_KEY, { auth: { persistSession: false } });
const flSecretCache: Record<string, string> = {};

async function flSecret(kind: string): Promise<string> {
  if (flSecretCache[kind]) return flSecretCache[kind];
  const { data, error } = await flDb.rpc('fl_get_secret', { p_kind: kind });
  if (error || !data) throw new Error('FL_SECRET_MISSING');
  flSecretCache[kind] = data as string;
  return data as string;
}

async function flVerifySignature(body: string, signature: string) {
  const secret = await flSecret('line_channel_secret');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

async function flReply(replyToken: string, messages: unknown[]) {
  const token = await flSecret('line_access_token');
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) console.error('line reply', res.status, await res.text());
}

async function flAiReply(text: string): Promise<string> {
  try {
    const key = await flSecret('ai_api_key');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: FL_AI_MODEL,
        max_tokens: 300,
        messages: [
          { role: 'system', content: `你是 LINE 官方帳號「${FL_OA_NAME}」的助理，協助專注力、健康生活與個人財務規劃。語氣：${FL_TONE} 回覆 150 字內，使用繁體中文。不得做醫療診斷或保證投資報酬。可引導使用者點選下方選單的「健康檢測」「財務健康度檢測」「個人資訊填寫」「聯絡專員」。` },
          { role: 'user', content: text.slice(0, 1000) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    return (await res.json()).choices[0].message.content.trim();
  } catch (e) {
    console.error(e);
    return '收到你的訊息了！目前忙碌中，可以先點選下方選單使用各項功能。';
  }
}

async function flHandleEvent(ev: Record<string, any>) {
  const userId = ev.source?.userId;
  if (ev.type === 'follow' && userId) {
    await flDb.from('fl_users').upsert({ line_user_id: userId, followed: true, updated_at: new Date().toISOString() });
    await flReply(ev.replyToken, [{
      type: 'text',
      text: `歡迎加入「${FL_OA_NAME}」！\n點選下方選單即可開始：\n・健康檢測\n・財務健康度檢測\n・個人資訊填寫\n・聯絡專員`,
    }]);
  } else if (ev.type === 'unfollow' && userId) {
    await flDb.from('fl_users').update({ followed: false, updated_at: new Date().toISOString() }).eq('line_user_id', userId);
  } else if (ev.type === 'message' && ev.message?.type === 'text' && ev.replyToken) {
    const text: string = ev.message.text || '';
    const reply = FL_URGENT_WORDS.some((w) => text.includes(w)) ? FL_URGENT_REPLY : await flAiReply(text);
    await flReply(ev.replyToken, [{ type: 'text', text: reply }]);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'GET') return new Response('fl-line-webhook ok');
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  const body = await req.text();
  const signature = req.headers.get('x-line-signature') || '';
  try {
    if (!signature || !(await flVerifySignature(body, signature))) {
      return new Response('invalid signature', { status: 401 });
    }
    const payload = JSON.parse(body);
    // LINE 驗證 Webhook 時 events 為空陣列，直接回 200
    await Promise.all((payload.events || []).map((ev: Record<string, unknown>) =>
      flHandleEvent(ev).catch((e) => console.error('event', e))));
    return new Response('ok');
  } catch (e) {
    console.error(e);
    return new Response('error', { status: 500 });
  }
});
