import { CHEMICALS, type Amounts, type ChemId } from '../data/chemicals';

// ============================================================
// 表示用の整形
// ============================================================

export function yen(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? '-' : ''}¥${Math.abs(rounded).toLocaleString('ja-JP')}`;
}

export function qty(value: number): string {
  return (Math.round(value * 10) / 10).toLocaleString('ja-JP');
}

export function chemName(chem: ChemId): string {
  return CHEMICALS[chem].name;
}

export function amountsText(amounts: Amounts): string {
  return (Object.entries(amounts) as [ChemId, number][])
    .map(([chem, n]) => `${chemName(chem)} ${qty(n)}`)
    .join(' + ');
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}
