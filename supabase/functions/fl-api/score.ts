// 健康檢測計分：依 blueprint compute_rules，AI 只給 1–10 分，總分一律由此計算
export const FL_SCORE_ITEMS = {
  face: ['氣色', '光澤', '膚色均勻', '眼下狀態', '浮腫', '紋理'],
  tongue: ['舌色', '舌苔顏色', '舌苔厚度', '濕潤度', '齒痕或裂紋'],
  eye: ['眼白清晰', '眼周暗沉', '浮腫', '精神感'],
} as const;

export const FL_WEIGHTS = {
  face: [0.15, 0.2, 0.2, 0.15, 0.15, 0.15],
  tongue: [0.25, 0.2, 0.2, 0.2, 0.15],
  eye: [0.3, 0.3, 0.2, 0.2],
  blocks: { face: 0.35, tongue: 0.4, eye: 0.25 },
} as const;

export type FlBlock = keyof typeof FL_SCORE_ITEMS;
const FL_BLOCKS: FlBlock[] = ['face', 'tongue', 'eye'];

function flValid(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10;
}

export interface FlScoreResult {
  total: number;
  breakdown: Record<FlBlock, { score: number | null; items: Record<string, number | null> }>;
}

// raw: { face: number[], tongue: number[], eye: number[] }
export function computeScores(raw: Record<string, unknown>): FlScoreResult {
  const breakdown = {} as FlScoreResult['breakdown'];
  let weighted = 0;
  let blockWeightSum = 0;

  for (const block of FL_BLOCKS) {
    const values = Array.isArray(raw[block]) ? raw[block] as unknown[] : [];
    const names = FL_SCORE_ITEMS[block];
    const weights = FL_WEIGHTS[block];
    const items: Record<string, number | null> = {};
    let sum = 0;
    let wsum = 0;
    names.forEach((name, i) => {
      const v = values[i];
      if (flValid(v)) {
        items[name] = v;
        sum += v * weights[i];
        wsum += weights[i];
      } else {
        items[name] = null;
      }
    });
    // 缺項時重新正規化該區權重
    const score = wsum > 0 ? sum / wsum : null;
    breakdown[block] = { score: score === null ? null : Math.round(score * 100) / 100, items };
    if (score !== null) {
      weighted += score * FL_WEIGHTS.blocks[block];
      blockWeightSum += FL_WEIGHTS.blocks[block];
    }
  }

  if (blockWeightSum === 0) throw new Error('FL_NO_VALID_ITEMS');
  // 缺整區時也重新正規化區塊權重
  const total = Math.min(100, Math.max(0, Math.round((weighted / blockWeightSum) * 10)));
  return { total, breakdown };
}
