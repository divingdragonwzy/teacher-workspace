import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, Footer, PageNumber, Tab, TabStopType } from 'docx';
import type { Paper } from './model';
import { answerLineCount, buildPaperUnits, isBlankPlaceholder, unitHeading } from './question-units';
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
            for (let n = 0; n < answerLineCount(q); n++)
                children.push(line('________________________________________________________________________', { spacing: { after: 160, line: 420 } }));
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
    '七年级英语导入示例',
    '一、听力理解',
    '第一节：听下面3段对话，每段对话后有一个小题，从题中所给的A、B、C三个选项中选出最佳选项。',
    '1. What does the boy want to drink?', 'A. Milk.    B. Juice.    C. Water.',
    '2. Where is the girl going?', 'A. To the library.    B. To the park.    C. To the shop.',
    '3. When will they meet?', 'A. At 8:00.    B. At 8:30.    C. At 9:00.',
    '二、单项选择',
    '4. My sister usually _____ to school by bus.', 'A. go    B. goes    C. going    D. went',
    '5. There is _____ apple on the desk.', 'A. a    B. an    C. the    D. /',
    '6. —Can you play the guitar? —_____. I learned it last year.', 'A. Yes, I can    B. No, I can\'t    C. Yes, I do    D. No, I don\'t',
    '三、完形填空',
    'Tom is my best friend. He lives 7.______ Green Street. Every morning he gets up 8.______ six. He likes sports very much, and he often 9.______ football with his classmates after school. He is very 10.______ and always helps others.',
    '7. A. on    B. in    C. at    D. to',
    '8. A. on    B. in    C. at    D. for',
    '9. A. plays    B. watches    C. reads    D. sees',
    '10. A. lazy    B. kind    C. quiet    D. shy',
    '四、阅读理解',
    'A',
    'Lucy is a student from Shanghai. She loves reading books. Every Saturday, she goes to the library with her brother. They usually stay there for two hours.',
    '11. Where does Lucy go every Saturday?', 'A. To the library.    B. To the zoo.    C. To the park.    D. To the cinema.',
    '12. Who goes with Lucy?', 'A. Her teacher.    B. Her sister.    C. Her brother.    D. Her mother.',
    '五、句子还原（从方框中选出能填入空白处的最佳选项，其中有两项多余）',
    'Do you want to make friends? Here are some ideas. 13.______ Say hello to the people around you. Join a club at school. 14.______ Then you can meet people with the same hobbies. Be a good listener. 15.______',
    'A. Smile at others.',
    'B. I don\'t like sports.',
    'C. People like friends who listen to them.',
    'D. It is an easy way to share your interests.',
    'E. My father is a doctor.',
    '六、任务型阅读',
    'Hi, I\'m Mike. I\'m 13 years old. My favourite subject is science because it is interesting. On weekends, I often help my mother cook dinner.',
    '16. How old is Mike?',
    '17. Why does Mike like science?',
    '七、词汇填空',
    '18. Look! The students are _____ (play) basketball.',
    '19. There are three _____ (box) on the table.',
    '八、短文填空（用括号内所给单词的适当形式填空）',
    'My name is Lily. I 20.______ (be) a student in Class 3. I have two good 21.______ (friend). We often 22.______ (go) to school together.',
    '九、完成句子（根据汉语意思完成句子）',
    '23. 我每天早上七点起床。I _____ _____ at seven every morning.',
    '24. 他对音乐感兴趣。He is _____ _____ music.',
    '十、书面表达',
    '25. 假如你是李华，请以 My Favourite Season 为题写一篇短文，介绍你最喜欢的季节。',
    '要求：', '1. 词数 60 左右；', '2. 说明喜欢的理由和这个季节常做的活动；', '3. 文中不得出现真实姓名和校名。',
    '参考答案',
    '1-3 BAC',
    '4. B', '【解析】主语 My sister 为第三人称单数，usually 表示经常性动作，谓语用 goes。',
    '5. B', '【解析】apple 以元音音素开头，用不定冠词 an。',
    '6. A',
    '7-10 ACAB',
    '11. A', '12. C',
    '13-15 ADC',
    '16. He is 13 years old.', '17. Because it is interesting.',
    '18. playing', '19. boxes',
    '20. am', '21. friends', '22. go',
    '23. get up', '24. interested in',
    '25. 【范文】', 'My Favourite Season', 'My favourite season is spring. It is warm and the flowers are beautiful. I often fly kites with my friends in the park. Spring makes me happy.',
];
export async function downloadTemplate() { const doc = makeDoc(TEMPLATE_LINES.map((t, i) => line(t, i === 0 ? { heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER } : {}))); download(await Packer.toBlob(doc), '初中英语_Word导入示例.docx'); }
