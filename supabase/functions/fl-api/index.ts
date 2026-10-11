// fl-api：LIFF 前端呼叫的 API（健康檢測、財務測驗、個人資料）
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { computeScores, FL_SCORE_ITEMS } from './score.ts';

const FL_SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const FL_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FL_LOGIN_CHANNEL_ID = Deno.env.get('FL_LOGIN_CHANNEL_ID') || ''; // 選填：限定 LIFF 所屬 channel
const FL_AI_MODEL = 'gpt-4o-mini';
const FL_ALLOWED_ORIGINS = ['https://ptgaminglife.github.io', 'http://localhost:8787'];
const FL_MAX_IMAGE_CHARS = 1_500_000;

const flDb = createClient(FL_SUPABASE_URL, FL_SERVICE_KEY, { auth: { persistSession: false } });

function flCors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': FL_ALLOWED_ORIGINS.includes(origin) ? origin : FL_ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function flJson(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...flCors(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function flSecret(kind: string): Promise<string> {
  const { data, error } = await flDb.rpc('fl_get_secret', { p_kind: kind });
  if (error || !data) throw new Error('FL_SECRET_MISSING');
  return data as string;
}

// 用 LIFF access token 驗證使用者並取得 LINE userId
async function flAuth(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const verify = await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(token)}`);
  if (!verify.ok) return null;
  const v = await verify.json();
  if (FL_LOGIN_CHANNEL_ID && v.client_id !== FL_LOGIN_CHANNEL_ID) return null;
  const prof = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${token}` } });
  if (!prof.ok) return null;
  const p = await prof.json();
  await flDb.from('fl_users').upsert({
    line_user_id: p.userId, display_name: p.displayName, picture_url: p.pictureUrl ?? null,
    updated_at: new Date().toISOString(),
  });
  return { userId: p.userId as string, displayName: p.displayName as string };
}

function flIsJpeg(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/jpeg;base64,') && v.length < FL_MAX_IMAGE_CHARS;
}

const FL_HEALTH_PROMPT = `你是外觀健康觀察助理，不做醫療診斷。根據兩張照片（臉部、舌部）給出 15 個觀察分數，
每項為 1–10 的整數，10 代表最佳狀態（例如「浮腫」10 分＝完全不浮腫）。看不清楚的項目給 null。
不要計算總分。只輸出 JSON：
{"face":[${FL_SCORE_ITEMS.face.join(',')}],"tongue":[${FL_SCORE_ITEMS.tongue.join(',')}],"eye":[${FL_SCORE_ITEMS.eye.join(',')}],
"notes":{"face":"一句觀察","tongue":"一句觀察","eye":"一句觀察"},
"summary":"80 字內溫暖、清楚的整體觀察，不得描述為疾病",
"tasks":["14 條每天可執行的生活任務，每條 20 字內"],
"urgent":false}
陣列內依序填入上列項目的分數。若照片顯示可能需要緊急就醫的狀況，urgent 設為 true。`;

async function flHealth(req: Request, body: Record<string, unknown>, userId: string) {
  if (!flIsJpeg(body.face) || !flIsJpeg(body.tongue)) {
    return flJson(req, { error: 'FL_BAD_IMAGE', message: '照片格式不正確或檔案過大，請重新拍攝。' }, 400);
  }
  const key = await flSecret('ai_api_key');
  const ai = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: FL_AI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: FL_HEALTH_PROMPT },
        { role: 'user', content: [
          { type: 'text', text: '第一張是臉部，第二張是舌部。' },
          { type: 'image_url', image_url: { url: body.face } },
          { type: 'image_url', image_url: { url: body.tongue } },
        ] },
      ],
    }),
  });
  if (!ai.ok) {
    console.error('openai', ai.status, await ai.text());
    return flJson(req, { error: 'FL_AI_FAILED', message: 'AI 分析暫時失敗，請稍後重試。' }, 502);
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse((await ai.json()).choices[0].message.content);
  } catch {
    return flJson(req, { error: 'FL_AI_JSON', message: 'AI 回傳格式異常，請重試。' }, 502);
  }
  let result;
  try {
    result = computeScores(raw);
  } catch {
    return flJson(req, { error: 'FL_NO_SCORES', message: '照片無法辨識，請在光線充足處重新拍攝。' }, 422);
  }
  const tasks = Array.isArray(raw.tasks) ? (raw.tasks as unknown[]).filter((t) => typeof t === 'string').slice(0, 14) : [];
  const summary = typeof raw.summary === 'string' ? raw.summary.slice(0, 300) : '';
  const aiTotal = typeof raw.total === 'number' ? raw.total : null;
  const { error } = await flDb.from('fl_health_reports').insert({
    line_user_id: userId, total: result.total, breakdown: result.breakdown,
    ai_raw: raw, ai_total: aiTotal, summary, tasks,
  });
  if (error) {
    console.error(error);
    return flJson(req, { error: 'FL_DB', message: '儲存失敗，請重試。' }, 500);
  }
  return flJson(req, {
    total: result.total, breakdown: result.breakdown, notes: raw.notes ?? {},
    summary, tasks, urgent: raw.urgent === true,
  });
}

const FL_FIN_DIMS = ['flexibility', 'stress', 'roi', 'health', 'growth'];

async function flFinance(req: Request, body: Record<string, unknown>, userId: string) {
  const answers = body.answers;
  const scores = body.scores as Record<string, unknown> | undefined;
  if (!Array.isArray(answers) || answers.length > 30 || !scores ||
      !FL_FIN_DIMS.every((d) => typeof scores[d] === 'number' && (scores[d] as number) >= 0 && (scores[d] as number) <= 100)) {
    return flJson(req, { error: 'FL_BAD_INPUT', message: '測驗資料不完整。' }, 400);
  }
  const clean = Object.fromEntries(FL_FIN_DIMS.map((d) => [d, Math.round(scores[d] as number)]));
  const { error } = await flDb.from('fl_finance_results').insert({ line_user_id: userId, answers, scores: clean });
  if (error) return flJson(req, { error: 'FL_DB', message: '儲存失敗，請重試。' }, 500);
  return flJson(req, { ok: true });
}

async function flProfile(req: Request, body: Record<string, unknown>, userId: string) {
  if (body.data === undefined) {
    const { data } = await flDb.from('fl_profiles').select('data,updated_at').eq('line_user_id', userId).maybeSingle();
    return flJson(req, data ?? { data: {} });
  }
  const data = body.data;
  if (typeof data !== 'object' || data === null || JSON.stringify(data).length > 20_000) {
    return flJson(req, { error: 'FL_BAD_INPUT', message: '資料格式不正確。' }, 400);
  }
  const { error } = await flDb.from('fl_profiles').upsert({
    line_user_id: userId, data, updated_at: new Date().toISOString(),
  });
  if (error) return flJson(req, { error: 'FL_DB', message: '儲存失敗，請重試。' }, 500);
  return flJson(req, { ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: flCors(req) });
  if (req.method !== 'POST') return flJson(req, { error: 'method_not_allowed' }, 405);
  try {
    const user = await flAuth(req);
    if (!user) return flJson(req, { error: 'FL_UNAUTHORIZED', message: '請從 LINE 開啟此頁面。' }, 401);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = new URL(req.url).pathname.split('/').pop();
    if (action === 'health') return await flHealth(req, body, user.userId);
    if (action === 'finance') return await flFinance(req, body, user.userId);
    if (action === 'profile') return await flProfile(req, body, user.userId);
    if (action === 'me') return flJson(req, user);
    return flJson(req, { error: 'not_found' }, 404);
  } catch (e) {
    console.error(e);
    return flJson(req, { error: 'FL_SERVER', message: '伺服器暫時無法處理，請稍後再試。' }, 500);
  }
});
