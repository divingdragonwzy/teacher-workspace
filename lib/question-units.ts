import type { PaperItem, Question } from './model';

/** A selectable question: either one standalone question or one complete passage. */
export type QuestionUnit = {
    id: string;
    composite: boolean;
    questions: Question[]; // Immutable original records, retained for editing and provenance.
    display: Question[]; // Local numbering; never written over the original records.
    material: string;
    sharedImages: { src: string; label: string }[];
    numberingIssues: string[];
};
export type PaperUnit = QuestionUnit & { items: PaperItem[]; total: number };

const SHARED_TYPES = new Set(['完形填空', '阅读理解', '句子还原', '任务型阅读', '短文填空', '听力选择']);
const blankToken = /(?<!\d)(?:[（(]\s*\d{1,3}\s*[）)]\s*(?=[_＿]{2,})|\d{1,3}\s*[.．、]\s*(?=[_＿]{2,})|[_＿]{2,}\s*(?:[（(]\s*)?\d{1,3}(?:\s*[）)])?\s*(?=[_＿]{2,}))/g;
const numberedReference = /(?<!\d)(?:[（(]\s*\d{1,3}\s*[）)]\s*(?=[_＿]{2,})|\d{1,3}\s*[.．、]\s*(?=[_＿]{2,})|[_＿]{2,}\s*(?:[（(]\s*)?\d{1,3}(?:\s*[）)])?\s*(?=[_＿]{2,})|第\s*\d{1,3}(?:\s*[、,，至到\-—~～]\s*\d{1,3})*\s*(?:小题|题|空)|\b(?:questions?|blanks?)\s+\d{1,3}(?:\s*(?:[-–—]|to|and)\s*\d{1,3})*)/gi;

/** Only explicit blank/question references are rewritten, never ordinary ages/dates/numbers. */
export function renumberReferences(text: string, numbers: ReadonlyMap<string, string>) {
    return text.replace(numberedReference, token => token.replace(/\d{1,3}/g, n => numbers.get(String(Number(n))) ?? n));
}

function unitKey(q: Question) {
    if (!q.material.trim() || !SHARED_TYPES.has(q.type)) return JSON.stringify(['single', q.id]);
    // Source, grade and type must match: equal text in different papers is never combined.
    return JSON.stringify(['passage', q.sourceId || q.source, q.grade, q.type, q.material.trim()]);
}

/** Group BEFORE searching/pagination. A match on one child still returns the entire passage. */
export function buildQuestionUnits(questions: readonly Question[]): QuestionUnit[] {
    const groups = new Map<string, Question[]>();
    for (const q of questions) {
        const key = unitKey(q);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(q);
    }
    return [...groups.values()].map(members => {
        const composite = !!members[0].material.trim() && SHARED_TYPES.has(members[0].type);
        const ordered = [...members];
        // Recover original order even for legacy saved papers with interleaved/reordered children.
        if (composite && ordered.every(q => /^\d+$/.test(q.originalNo))) ordered.sort((a, b) => Number(a.originalNo) - Number(b.originalNo));
        const numbers = new Map<string, string>();
        const duplicates = new Set<string>();
        ordered.forEach((q, i) => {
            if (!/^\d+$/.test(q.originalNo)) return;
            const no = String(Number(q.originalNo));
            if (numbers.has(no)) duplicates.add(no);
            numbers.set(no, String(i + 1));
        });
        duplicates.forEach(no => numbers.delete(no));
        const rawMaterial = ordered[0].material.trim();
        const missing = composite ? [...new Set([...rawMaterial.matchAll(blankToken)].flatMap(m => m[0].match(/\d{1,3}/g) || []))]
            .filter(no => !numbers.has(String(Number(no)))) : [];
        const numberingIssues = [
            ...(duplicates.size ? [`原题号 ${[...duplicates].join('、')} 重复，请先核对大题分组。`] : []),
            ...(missing.length ? [`材料中的原题 ${missing.join('、')} 未完整选入，请回题库补齐整题，或核对材料与小题。`] : []),
        ];
        const sharedImages = composite ? [...new Map(ordered.flatMap(q => q.images.flatMap((src, i) => q.imageLabels?.[i] === '共用材料配图' ? [[src, { src, label: '共用材料配图' }] as const] : []))).values()] : [];
        const material = composite ? renumberReferences(rawMaterial, numbers) : rawMaterial;
        const display = ordered.map(q => {
            if (!composite) return q;
            const ownImages = q.images.map((src, i) => ({ src, label: q.imageLabels?.[i] || '题目配图' })).filter(i => i.label !== '共用材料配图');
            return { ...q, material, stem: renumberReferences(q.stem, numbers), options: q.options.map(o => renumberReferences(o, numbers)),
                answer: renumberReferences(q.answer, numbers), analysis: renumberReferences(q.analysis, numbers), images: ownImages.map(i => i.src), imageLabels: ownImages.map(i => i.label) };
        });
        return { id: ordered[0].id, composite, questions: ordered, display, material, sharedImages, numberingIssues };
    });
}

export function filterQuestionUnits(units: readonly QuestionUnit[], filters: { grade: string; type: string; knowledge: string; search: string }) {
    const needle = filters.search.trim().toLowerCase();
    return units.filter(unit => unit.questions.some((q, i) =>
        (filters.grade === '全部年级' || q.grade === filters.grade) &&
        (filters.type === '全部题型' || q.type === filters.type) &&
        (filters.knowledge === '全部知识点' || q.knowledge.includes(filters.knowledge)) &&
        `${q.stem} ${q.material} ${unit.display[i].stem} ${unit.material} ${q.knowledge.join(' ')} ${q.source}`.toLowerCase().includes(needle)));
}

export function buildPaperUnits(items: readonly PaperItem[]): PaperUnit[] {
    const byId = new Map(items.map(item => [item.question.id, item]));
    return buildQuestionUnits(items.map(i => i.question)).map(unit => {
        const members = unit.questions.map(q => byId.get(q.id)!);
        return { ...unit, items: members, total: members.reduce((sum, i) => sum + i.score, 0) };
    });
}

export function unitSelection(items: readonly PaperItem[], unit: QuestionUnit) {
    const ids = new Set(items.map(i => i.question.id));
    const count = unit.questions.filter(q => ids.has(q.id)).length;
    return count === unit.questions.length ? 'all' : count ? 'partial' : 'none';
}

/** Atomic add/remove, including completion of older partially selected passages. */
export function toggleQuestionUnit(items: readonly PaperItem[], unit: QuestionUnit, limit = 200): PaperItem[] {
    const ids = new Set(unit.questions.map(q => q.id));
    const outside = items.filter(i => !ids.has(i.question.id));
    if (unitSelection(items, unit) === 'all') return outside;
    if (outside.length + unit.questions.length > limit) throw new Error(`一份试卷最多 ${limit} 道小题，剩余容量不足以加入整道大题。`);
    const existing = new Map(items.map(i => [i.question.id, i]));
    const members = unit.questions.map(q => {
        const saved = existing.get(q.id);
        // A changed passage cannot mix two material/numbering versions during completion.
        return saved && unitKey(saved.question) === unitKey(q) && saved.question.originalNo === q.originalNo
            ? saved : { question: structuredClone(q), score: saved?.score ?? 2 };
    });
    const first = items.findIndex(i => ids.has(i.question.id));
    const at = first < 0 ? outside.length : items.slice(0, first).filter(i => !ids.has(i.question.id)).length;
    return [...outside.slice(0, at), ...members, ...outside.slice(at)];
}

export function removePaperUnit(items: readonly PaperItem[], unit: QuestionUnit) {
    const ids = new Set(unit.questions.map(q => q.id));
    return items.filter(i => !ids.has(i.question.id));
}

export function movePaperUnit(items: readonly PaperItem[], index: number, step: number) {
    const units = buildPaperUnits(items);
    if (index < 0 || index >= units.length || index + step < 0 || index + step >= units.length) return [...items];
    [units[index], units[index + step]] = [units[index + step], units[index]];
    return units.flatMap(u => u.items);
}

export function unitHeading(unit: QuestionUnit, index: number) {
    return `第 ${index + 1} ${unit.composite ? '大题' : '题'} · ${unit.questions[0].type}`;
}

export function isBlankPlaceholder(stem: string) { return /^第\s*\d+\s*空[（(]见共用材料[）)]$/.test(stem.trim()); }
