import { blankQuestion, type Grade, type Question, type QType } from './model';

export const PARSER_VERSION = '2.0';
const IMAGE = /\[\[IMAGE:([^\]]+)\]\]/g;
const answerHeading = /^(?:参考答案(?:与解析|及解析)?|答案(?:与解析|及解析)?|答案汇总|answer\s*key)\s*[:：]?\s*$/i;
const numbered = /^(?:[（(]\s*[）)]\s*)?(?:[（(]\s*(\d{1,3})\s*[）)]|(\d{1,3})\s*[.．、)）])\s*(.*)$/;
const blankNumbers = /(?:^|[^\d])(\d{1,3})\s*[.．、]\s*[_＿]{2,}/g;
const sharedTypes: QType[] = ['阅读理解', '完形填空', '句子还原', '任务型阅读', '短文填空', '听力选择'];

function decode(s: string) {
    return s.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
        const c = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
        return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : '';
    }).replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** Keep list starts and nested list counters, explicit underline markers, and image positions. */
export function htmlToLines(html: string) {
    const lists: { next: number; ordered: boolean }[] = [];
    const text = html.replace(/<\/?(?:ol|ul|li)\b[^>]*>/gi, tag => {
        if (/^<\/(?:ol|ul)/i.test(tag)) { lists.pop(); return '\n'; }
        if (/^<(?:ol|ul)/i.test(tag)) {
            lists.push({ next: Number(tag.match(/\bstart=["']?(\d+)/i)?.[1] || 1), ordered: /^<ol/i.test(tag) });
            return '\n';
        }
        if (/^<\/li/i.test(tag)) return '\n';
        const list = lists.at(-1);
        if (!list?.ordered) return '\n• ';
        const value = tag.match(/\bvalue=["']?(\d+)/i)?.[1];
        if (value) list.next = Number(value);
        return `\n${list.next++}. `;
    }).replace(/<u\b[^>]*>/gi, '【画线：').replace(/<\/u>/gi, '】')
        .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, '\n[[IMAGE:$1]]\n')
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/(?:p|h[1-6]|tr|table)>/gi, '\n')
        .replace(/<\/(?:td|th)>/gi, '\t').replace(/<[^>]+>/g, '');
    return decode(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

function typeFrom(line: string): QType | undefined {
    if (/听|listening/i.test(line)) return '听力选择';
    if (/完形|cloze/i.test(line)) return '完形填空';
    if (/句子还原|[五七六]选[五六四]|选句填空/.test(line)) return '句子还原';
    if (/任务型|阅读表达|回答问题/.test(line)) return '任务型阅读';
    if (/短文填空|语法填空|短文语法/.test(line)) return '短文填空';
    if (/阅读|reading/i.test(line)) return '阅读理解';
    if (/书面表达|写作|writing/i.test(line)) return '书面表达';
    if (/完成句子|翻译|句型转换/i.test(line)) return '完成句子';
    if (/词汇|填空|词语运用/i.test(line)) return '词汇填空';
    if (/单项|选择填空|multiple.choice|单选/i.test(line)) return '单项选择';
}

function isSection(line: string) {
    return /^(?:[一二三四五六七八九十]+[、.．]|[IVX]+[.、]\s*|Part\s+\w+|Section\s+\w+)/i.test(line)
        || (/^(单项选择|阅读理解|完形填空|词汇填空|书面表达|短文填空|句子还原|任务型阅读)/.test(line) && line.length < 80);
}

type Answer = { answer: string; analysis: string };
function parseAnswers(lines: string[]) {
    const answers = new Map<string, Answer[]>();
    let current: Answer | undefined, inAnalysis = false;
    const add = (no: string, answer: string) => {
        current = { answer: answer.trim(), analysis: '' };
        answers.set(String(Number(no)), [...(answers.get(String(Number(no))) || []), current]);
        inAnalysis = false;
    };
    for (const line of lines) {
        if (isSection(line) || answerHeading.test(line)) { current = undefined; continue; }
        const range = line.match(/^(\d+)\s*[-—~～]\s*(\d+)\s*[.、:：]?\s*([A-H\s]+)$/i);
        if (range) {
            const chars = range[3].replace(/\s/g, '').toUpperCase();
            if (Number(range[2]) - Number(range[1]) + 1 === chars.length)
                chars.split('').forEach((a, i) => add(String(Number(range[1]) + i), a));
            current = undefined;
            continue;
        }
        const analysis = line.match(/^(?:【解析】\s*[:：]?|解析\s*[:：]|Explanation\s*[:：])\s*(.*)$/i);
        if (current && analysis) { current.analysis += (current.analysis ? '\n' : '') + analysis[1]; inAnalysis = true; continue; }
        // Compact answer keys are accepted only when the entire line is choice-letter pairs.
        if (/^(?:\d{1,3}\s*[.．、:：)）]\s*[A-H]+\s*){2,}$/i.test(line)) {
            for (const m of line.matchAll(/(\d{1,3})\s*[.．、:：)）]\s*([A-H]+)/gi)) add(m[1], m[2].toUpperCase());
            continue;
        }
        const start = line.match(/^(?:[（(](\d{1,3})[）)]|(\d{1,3})\s*[.．、:：)）])\s*(.*)$/);
        if (start && !(current && inAnalysis)) { add(start[1] || start[2], start[3]); continue; }
        // A new numbered answer still ends a preceding explanation. Avoid matching years in prose.
        if (start && /^\d{1,3}[.．、:：)）]/.test(line)) { add(start[1] || start[2], start[3]); continue; }
        if (current) {
            const key = inAnalysis ? 'analysis' : 'answer';
            current[key] += (current[key] ? '\n' : '') + line;
        }
    }
    return answers;
}

function optionsIn(text: string) {
    const matches = [...text.matchAll(/(?:^|[\s?？!！。;；])([A-H])[.．、)）]\s*/g)];
    if (!matches.length) return { stem: text, options: [] as string[] };
    const first = matches[0];
    const start = first.index! + first[0].indexOf(first[1]);
    // Inside a stem, require multiple consecutive options so initials do not split prose.
    if (start > 0 && (first[1] !== 'A' || matches.length < 2)) return { stem: text, options: [] as string[] };
    if (matches.some((m, i) => i > 0 && m[1].charCodeAt(0) !== matches[i - 1][1].charCodeAt(0) + 1))
        return { stem: text, options: [] as string[] };
    return {
        stem: text.slice(0, start).trim(),
        options: matches.map((m, i) => `${m[1]}. ${text.slice(m.index! + m[0].length, matches[i + 1]?.index ?? text.length).trim()}`),
    };
}

function knowledgeFor(q: Question) {
    if (/考查名词/.test(q.analysis)) return ['名词'];
    if (/考查介词/.test(q.analysis)) return ['介词'];
    if (/考查(?:形容词|副词)/.test(q.analysis)) return ['形容词与副词'];
    if (sharedTypes.includes(q.type) || q.type === '书面表达') return [q.type];
    const s = q.stem.toLowerCase();
    if (/yesterday|last (?:week|year|sunday|month)|\bago\b/.test(s)) return ['一般过去时'];
    if (/usually|every (?:day|morning)|often/.test(s)) return ['一般现在时'];
    if (/look!|listen!|right now/.test(s)) return ['现在进行时'];
    if (/since|already|yet|ever/.test(s)) return ['现在完成时'];
    return [];
}

export function splitQuestions(lines: string[], grade: Grade, source: string, sourceId?: string) {
    const questions: Question[] = [];
    const warnings = ['规则拆题结果需逐题核对；知识点为规则建议，不代表内容已经审核。'];
    const answerIndex = lines.findIndex(l => answerHeading.test(l));
    const body = answerIndex >= 0 ? lines.slice(0, answerIndex) : lines;
    const answers = parseAnswers(answerIndex >= 0 ? lines.slice(answerIndex + 1) : []);
    const sections: { type: QType; lines: string[] }[] = [];
    let section = { type: '其他' as QType, lines: [] as string[] }, listening = false;
    for (const line of body) {
        if (/^(听力部分|笔试部分)/.test(line)) { listening = line.startsWith('听力'); continue; }
        if (isSection(line)) {
            sections.push(section);
            section = { type: listening ? '听力选择' : typeFrom(line) || '其他', lines: [] };
        } else section.lines.push(line);
    }
    sections.push(section);
    const make = (no: string, type: QType, stem: string, material = ''): Question => ({
        ...blankQuestion(grade), source, sourceId, type, originalNo: String(Number(no)), stem, material,
        imageLabels: [],
    });
    for (const section of sections) {
        const { type } = section;
        // Embedded gaps belong to the whole passage, never to just the preceding paragraph.
        const gaps = [...new Set([...section.lines.join('\n').matchAll(blankNumbers)].map(m => m[1]))];
        if (gaps.length && (type === '短文填空' || type === '句子还原')) {
            const optionLines: string[] = [], materialLines: string[] = [];
            let optionMode = false;
            for (const line of section.lines) {
                const parts = type === '句子还原' ? optionsIn(line) : { stem: line, options: [] };
                if (!parts.stem && parts.options.length) { optionMode = true; optionLines.push(...parts.options); }
                else if (optionMode && optionLines.length) optionLines[optionLines.length - 1] += '\n' + line;
                else materialLines.push(line);
            }
            for (const no of gaps) questions.push({ ...make(no, type, `第 ${no} 空（见共用材料）`, materialLines.join('\n')), options: [...optionLines] });
            continue;
        }
        let current: Question | undefined, material: string[] = [], shared = '', mode: 'stem' | 'options' | 'answer' | 'analysis' = 'stem';
        let requirements = false;
        const flush = () => {
            if (current) {
                current.stem = current.stem.trim() || `第 ${current.originalNo} 空（见共用材料）`;
                questions.push(current);
            }
            current = undefined; mode = 'stem'; requirements = false;
        };
        const append = (line: string) => {
            if (!current) { material.push(line); return; }
            const answer = line.match(/^(?:【答案】\s*[:：]?|答案\s*[:：]|Answer\s*[:：])\s*(.*)$/i);
            const analysis = line.match(/^(?:【解析】\s*[:：]?|解析\s*[:：]|Explanation\s*[:：])\s*(.*)$/i);
            if (answer) { current.answer = answer[1]; mode = 'answer'; return; }
            if (analysis) { current.analysis = analysis[1]; mode = 'analysis'; return; }
            if (mode === 'answer' || mode === 'analysis') { current[mode] += '\n' + line; return; }
            const parts = type === '书面表达' ? { stem: line, options: [] } : optionsIn(line);
            if (parts.options.length) {
                if (parts.stem) current.stem += (current.stem ? '\n' : '') + parts.stem;
                current.options.push(...parts.options); mode = 'options';
                if (current.type === '其他') current.type = '单项选择';
            } else if (mode === 'options' && current.options.length) current.options[current.options.length - 1] += '\n' + line;
            else current.stem += (current.stem ? '\n' : '') + line;
        };
        for (const [lineIndex, line] of section.lines.entries()) {
            // Bare A/B/C passage labels differ from A./B./C. image-only option labels.
            const nextLine = section.lines[lineIndex + 1] || '';
            const passageLabel = /^[A-D]$/.test(line) || (/^[A-D][.、．]$/.test(line) && !/^\[\[IMAGE:/.test(nextLine) && (!current || current.options.length >= 2));
            if (passageLabel && ['阅读理解', '任务型阅读', '完形填空'].includes(type)) {
                flush(); material = []; shared = ''; continue;
            }
            if (type === '听力选择' && /^(第[一二三四五六七八九十]+节|听第\d+段|听下面)/.test(line)) {
                flush(); material = [line]; shared = ''; continue;
            }
            if (current?.type === '书面表达' && /^(要求|注意|提示|写作要求|要点)\s*[:：]/.test(line)) requirements = true;
            const start = line.match(numbered);
            const no = start ? start[1] || start[2] : '';
            const writingBullet = current?.type === '书面表达' && start && (Number(no) <= Number(current.originalNo) || (requirements && Number(no) <= 10));
            if (start && !writingBullet) {
                flush();
                if (material.length) { shared = material.join('\n'); material = []; }
                current = make(no, type, '', sharedTypes.includes(type) ? shared : '');
                append(start[3]);
            } else append(line);
        }
        flush();
    }
    if (!questions.length) {
        warnings.push('未识别出标准题号，已保留全文为一个待拆分条目；请编辑或手动新增题目。');
        questions.push({ ...blankQuestion(grade), source, sourceId, type: typeFrom(body.join(' ')) || '其他', stem: body.join('\n') || '请对照原卷补充题干', imageLabels: [] });
    }
    const counts = new Map<string, number>();
    questions.forEach(q => counts.set(q.originalNo, (counts.get(q.originalNo) || 0) + 1));
    let matchedAnswers = 0;
    for (const q of questions) {
        const candidate = answers.get(q.originalNo);
        if (!q.answer && candidate?.length === 1 && counts.get(q.originalNo) === 1) {
            q.answer = candidate[0].answer; q.analysis = candidate[0].analysis; matchedAnswers++;
        } else if (!q.answer && candidate) q.warnings.push('原题号或答案编号重复，答案未自动匹配');
        if (!q.answer) q.warnings.push('未匹配到答案');
        const extractImages = (text: string, label: string) => text.replace(IMAGE, (_, url: string) => {
            if (url === 'unsupported-image') { q.warnings.push('此处配图未能读取，请对照原卷'); return '[配图未能读取]'; }
            if (!q.images.includes(url)) { q.images.push(url); q.imageLabels!.push(label); }
            return `[${label}，见配图]`;
        });
        q.stem = extractImages(q.stem, '题目配图');
        q.material = extractImages(q.material, '共用材料配图');
        q.options = q.options.map(o => extractImages(o, `选项 ${o[0]} 配图`));
        if (!q.stem.trim() || /^\[题目配图，见配图\]$/.test(q.stem.trim())) q.stem = '图片题：请对照配图补充题干（暂不识别图片文字）';
        q.knowledge = knowledgeFor(q);
        if (q.type === '其他') q.warnings.push('请确认题型');
        if (['单项选择', '听力选择', '完形填空', '句子还原'].includes(q.type) && q.options.length < 2) q.warnings.push('请核对选项是否完整');
        if (/画线|划线|underlined/i.test(q.stem) && !/【画线：/.test(q.material + q.stem)) q.warnings.push('画线标记未识别，请对照原卷确认所指内容');
    }
    const unmatchedAnswers = [...answers.keys()].filter(no => !counts.has(no));
    const duplicateNumbers = [...counts.keys()].filter(no => no && counts.get(no)! > 1);
    const nums = [...counts.keys()].map(Number).filter(n => n > 0);
    const missingNumbers: string[] = [];
    if (nums.length > 1 && Math.max(...nums) <= 200) {
        for (let n = Math.min(...nums); n <= Math.max(...nums); n++) if (!counts.has(String(n))) missingNumbers.push(String(n));
    }
    if (unmatchedAnswers.length) warnings.push(`答案区有 ${unmatchedAnswers.length} 个题号未找到题目：${unmatchedAnswers.join('、')}。请检查漏题，不会依据答案凭空生成题目。`);
    if (duplicateNumbers.length) warnings.push(`发现重复题号：${duplicateNumbers.join('、')}，相关答案需人工匹配。`);
    if (missingNumbers.length) warnings.push(`题号存在缺口：${missingNumbers.join('、')}。若原卷分节重新编号，请人工确认。`);
    if (answerIndex < 0) warnings.push('未找到独立答案区；若答案在另一份文档中，请在核对页补充。');
    const missingImages = [...new Set([...body.join('\n').matchAll(IMAGE)].map(m => m[1]))].filter(src => src !== 'unsupported-image' && !questions.some(q => q.images.includes(src)));
    if (missingImages.length) warnings.push(`有 ${missingImages.length} 张图片未关联到题目，请对照原文补充。`);
    if (questions.length > 200) throw new Error('单份试卷最多识别 200 道题，请拆分后上传。');
    return { questions, warnings, report: {
        version: PARSER_VERSION, questionCount: questions.length, answerCount: answers.size, matchedAnswers,
        unmatchedAnswers, duplicateNumbers, missingNumbers,
        imageCount: new Set(questions.flatMap(q => q.images)).size,
        reviewCount: questions.filter(q => q.warnings.length).length,
    } };
}
