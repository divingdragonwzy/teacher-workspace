import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, Footer, PageNumber, Tab, TabStopType } from 'docx';
import type { Paper } from './model';
import { buildPaperUnits, isBlankPlaceholder, unitHeading } from './question-units';
import { materialBlocks, optionColumns, optionRows } from './paper-layout';
const line = (text: string, extra: Record<string, unknown> = {}) => new Paragraph({ children: [new TextRun({ text, font: { ascii: 'Times New Roman', eastAsia: 'Microsoft YaHei' }, size: extra.heading === HeadingLevel.TITLE ? 36 : extra.heading ? 28 : 24, bold: !!extra.heading, color: '000000' })], spacing: { after: 120, line: 330 }, ...extra });
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
async function picture(url: string) { const r = await fetch(url); if (!r.ok)
    throw new Error('有配图未能读取，已停止导出；请刷新后重试，避免遗漏图片。'); const blob = await r.blob(); const data = new Uint8Array(await blob.arrayBuffer()); const bitmap = await createImageBitmap(blob); const width = Math.min(bitmap.width, 470), height = width / bitmap.width * bitmap.height; bitmap.close(); let bytes = data; let type: 'png' | 'jpg' | 'gif' = 'png'; if (blob.type === 'image/jpeg')
    type = 'jpg';
else if (blob.type === 'image/gif')
    type = 'gif';
else if (blob.type !== 'image/png') {
    const bm = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bm.width;
    canvas.height = bm.height;
    canvas.getContext('2d')!.drawImage(bm, 0, 0);
    bm.close();
    const b = await new Promise<Blob>((resolve, reject) => canvas.toBlob(x => x ? resolve(x) : reject(new Error('配图转换失败')), 'image/png'));
    bytes = new Uint8Array(await b.arrayBuffer());
} return new Paragraph({ children: [new ImageRun({ data: bytes, type, transformation: { width, height } })], spacing: { after: 180 } }); }
function makeDoc(children: Paragraph[]) {
    return new Document({
        creator: '拾题 · 初中英语题库',
        styles: { default: { document: { run: { font: { ascii: 'Times New Roman', eastAsia: 'Microsoft YaHei' }, size: 24 }, paragraph: { spacing: { line: 330, after: 120 } } } } },
        sections: [{
                properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 1080, left: 1134, right: 1134 } } },
                footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['第 ', PageNumber.CURRENT, ' 页'], size: 18, color: '888888' })] })] }) }, children
            }]
    });
}
function choiceLines(options: string[], number?: number) {
    const columns = optionColumns(options), rows = optionRows(options);
    const inset = number === undefined ? 0 : 480;
    const width = 11906 - 1134 * 2 - inset;
    const font = { ascii: 'Times New Roman', eastAsia: 'Microsoft YaHei' };
    return rows.map((row, rowIndex) => {
        const children: TextRun[] = [];
        if (number !== undefined) children.push(new TextRun({ text: rowIndex === 0 ? `${number}.` : '', font, size: 24 }), new TextRun({ children: [new Tab()] }));
        row.forEach((text, i) => {
            if (i) children.push(new TextRun({ children: [new Tab()] }));
            text.split(/\r?\n/).forEach((part, j) => children.push(new TextRun({ text: part, font, size: 24, break: j ? 1 : undefined })));
        });
        const positions = Array.from({ length: columns }, (_, i) => inset + Math.floor(width / columns) * i).filter(p => p > 0);
        return line('', { children, tabStops: positions.map(position => ({ type: TabStopType.LEFT, position })),
            indent: inset ? { left: inset, hanging: inset } : undefined, keepNext: rowIndex < rows.length - 1 });
    });
}
export async function buildPaperDocument(paper: Paper, answers: boolean) {
    const total = paper.items.reduce((n, i) => n + i.score, 0);
    const units = buildPaperUnits(paper.items);
    const issues = units.flatMap(u => u.numberingIssues);
    if (issues.length) throw new Error(`暂不能导出不完整的大题：${issues[0]}`);
    const children: Paragraph[] = [line(paper.title, { heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }), line(`${paper.grade}  英语    满分 ${total} 分    建议用时 ${paper.minutes} 分钟`, { alignment: AlignmentType.CENTER }), line('班级：________________    姓名：________________', { spacing: { after: 360 } })];
    for (const [unitIndex, unit] of units.entries()) {
        if (unit.composite) children.push(line(`${unitHeading(unit, unitIndex)}（${unit.items.length} 小题，共 ${unit.total} 分）`, { heading: HeadingLevel.HEADING_2, keepNext: true }));
        for (const block of materialBlocks(unit.material, unit.sharedImages)) {
            if (block.kind === 'image') children.push(await picture(block.src));
            else block.text.split('\n').forEach(t => children.push(line(t)));
        }
        for (const [localIndex, q] of unit.display.entries()) {
            const number = unit.composite ? localIndex + 1 : unitIndex + 1;
            const stem = isBlankPlaceholder(q.stem) ? '' : q.stem;
            const inlineChoices = !stem && q.options.length > 0 && !q.images.length;
            if (!inlineChoices) stem.split('\n').forEach((t, n) => children.push(line(n === 0 ? `${number}. ${t}` : t, { keepNext: q.options.length > 0 || n < stem.split('\n').length - 1 })));
            for (let imageIndex = 0; imageIndex < q.images.length; imageIndex++) {
                const label = q.imageLabels?.[imageIndex];
                if (label && label !== '共用材料配图') children.push(line(label, { keepNext: true }));
                children.push(await picture(q.images[imageIndex]));
            }
            children.push(...choiceLines(q.options, inlineChoices ? number : undefined));
            if (!q.options.length) {
                for (let n = 0; n < (q.type === '书面表达' ? 7 : 2); n++)
                    children.push(line('________________________________________________________________________', { spacing: { after: 160, line: 420 } }));
            }
        }
    }
    if (answers) {
        children.push(line('参考答案与解析', { heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
        units.forEach((unit, unitIndex) => {
            if (unit.composite) children.push(line(unitHeading(unit, unitIndex), { heading: HeadingLevel.HEADING_2, keepNext: true }));
            unit.display.forEach((q, localIndex) => {
                children.push(line(`${unit.composite ? localIndex + 1 : unitIndex + 1}. ${q.answer || '【待补充答案】'}`));
                if (q.analysis) q.analysis.split('\n').forEach(t => children.push(line(`解析：${t}`)));
                if (q.knowledge.length) children.push(line(`知识点：${q.knowledge.join('；')}`));
            });
        });
    }
    return makeDoc(children);
}
export async function downloadPaper(paper: Paper, answers: boolean) { if (!paper.title.trim())
    throw new Error('请先填写试卷名称。'); const doc = await buildPaperDocument(paper, answers); const blob = await Packer.toBlob(doc); download(blob, `${paper.title.replace(/[<>:"/\\|?*]/g, '_')}_${answers ? '教师答案' : '学生试卷'}.docx`); }
export const TEMPLATE_LINES = [
    '七年级英语导入示例', '一、单项选择',
    '1. My sister usually _____ to school by bus.', 'A. go    B. goes    C. going    D. went',
    '2. There is _____ apple on the desk.', 'A. a    B. an    C. the    D. /',
    '二、词汇填空', '3. Look! The students are _____ (play) basketball.',
    '三、阅读理解', 'A', 'Lucy is a student from Shanghai. She loves reading books. Every Saturday, she goes to the library with her brother. They usually stay there for two hours.',
    '4. Where does Lucy go every Saturday?', 'A. To the library.    B. To the zoo.    C. To the park.    D. To the cinema.',
    '5. Who goes with Lucy?', 'A. Her teacher.    B. Her sister.    C. Her brother.    D. Her mother.',
    '四、书面表达', '6. Write a short paragraph about your favourite school subject (about 60 words).',
    '参考答案', '1. B', '2. B', '3. playing', '4. A', '5. C', '6. 开放性答案。围绕学科、喜欢的理由及学习活动展开，注意语句连贯。'
];
export async function downloadTemplate() { const doc = makeDoc(TEMPLATE_LINES.map((t, i) => line(t, i === 0 ? { heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER } : {}))); download(await Packer.toBlob(doc), '初中英语_Word导入示例.docx'); }
