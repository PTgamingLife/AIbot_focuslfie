// fl-setup-richmenu：用 OpenAI 生成 4 格圖文選單底圖，建立並設為預設選單（管理用，需 admin token）
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const FL_SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const FL_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const flDb = createClient(FL_SUPABASE_URL, FL_SERVICE_KEY, { auth: { persistSession: false } });

const FL_W = 1536;
const FL_H = 1024;
const FL_LIFF_RE = /^\d{6,12}-[A-Za-z0-9]{6,12}$/;
const FL_CELLS = [
  { label: '健康檢測', p: 'health', size: 'compact' },
  { label: '財務健康度檢測', p: 'finance', size: 'compact' },
  { label: '個人資訊填寫', p: 'profile', size: 'full' },
  { label: '聯絡專員', p: 'contact', size: 'compact' },
] as const;

const FL_IMAGE_PROMPT = `LINE official account rich menu, flat modern UI, exactly 2x2 grid of four equal rounded tiles with thin gaps,
color palette deep navy #1E3A5F background, teal #2EC4B6 accents, off-white #F7F9FB tiles.
Each tile has one simple line icon centered above a large bold Traditional Chinese label, perfectly legible:
top-left icon of a face with a heart pulse, label "健康檢測";
top-right icon of a coin with a rising chart, label "財務健康度檢測";
bottom-left icon of a profile card with a pen, label "個人資訊填寫";
bottom-right icon of a chat bubble with a headset, label "聯絡專員".
No other text, no watermark, high contrast, clean and professional.`;

async function flSha256(v: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function flSecret(kind: string): Promise<string> {
  const { data, error } = await flDb.rpc('fl_get_secret', { p_kind: kind });
  if (error || !data) throw new Error(`FL_SECRET_MISSING:${kind}`);
  return data as string;
}

async function flLine(path: string, token: string, init: RequestInit = {}, host = 'api.line.me') {
  const res = await fetch(`https://${host}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LINE ${path} ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function flGenerateImage(): Promise<Uint8Array> {
  const key = await flSecret('ai_api_key');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-1', prompt: FL_IMAGE_PROMPT, size: `${FL_W}x${FL_H}`,
      quality: 'medium', output_format: 'jpeg', output_compression: 80, n: 1,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI image ${res.status} ${await res.text()}`);
  const b64 = (await res.json()).data[0].b64_json as string;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (bytes.length > 1_000_000) throw new Error(`FL_IMAGE_TOO_LARGE:${bytes.length}`);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  try {
    const adminToken = req.headers.get('x-fl-admin') || '';
    const { data: setting } = await flDb.from('fl_settings').select('value').eq('key', 'admin_token_sha256').maybeSingle();
    if (!adminToken || !setting || setting.value !== await flSha256(adminToken)) {
      return new Response('unauthorized', { status: 401 });
    }
    const body = await req.json();
    const liff = { compact: String(body.liffCompact || ''), full: String(body.liffFull || '') };
    if (!FL_LIFF_RE.test(liff.compact) || !FL_LIFF_RE.test(liff.full)) {
      return new Response('invalid LIFF id', { status: 400 });
    }

    const token = await flSecret('line_access_token');
    const image = await flGenerateImage();
    const halfW = FL_W / 2;
    const halfH = FL_H / 2;
    const menu = await flLine('/v2/bot/richmenu', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        size: { width: FL_W, height: FL_H },
        selected: true,
        name: 'focuslife-main',
        chatBarText: '開啟選單',
        areas: FL_CELLS.map((c, i) => ({
          bounds: { x: (i % 2) * halfW, y: Math.floor(i / 2) * halfH, width: halfW, height: halfH },
          action: { type: 'uri', label: c.label, uri: `https://liff.line.me/${liff[c.size]}?p=${c.p}` },
        })),
      }),
    });
    const richMenuId = menu.richMenuId as string;
    await flLine(`/v2/bot/richmenu/${richMenuId}/content`, token, {
      method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: image,
    }, 'api-data.line.me');
    await flLine(`/v2/bot/user/all/richmenu/${richMenuId}`, token, { method: 'POST' });

    // 刪除上一版選單，避免累積
    const { data: prev } = await flDb.from('fl_settings').select('value').eq('key', 'rich_menu_id').maybeSingle();
    if (prev?.value && prev.value !== richMenuId) {
      await flLine(`/v2/bot/richmenu/${prev.value}`, token, { method: 'DELETE' }).catch((e) => console.error(e));
    }
    await flDb.from('fl_settings').upsert([
      { key: 'rich_menu_id', value: richMenuId, updated_at: new Date().toISOString() },
      { key: 'liff_ids', value: liff, updated_at: new Date().toISOString() },
    ]);
    return new Response(JSON.stringify({ ok: true, richMenuId, imageBytes: image.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e instanceof Error ? e.message : e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
