import mammoth from 'mammoth';
import { htmlToLines, inspectZip, splitQuestions } from './parser';
import type { Grade, Source } from './model';

/** Local deterministic parsing only. No model calls or external document transfer. */
export async function parseWord(bytes: Uint8Array, grade: Grade, name: string, sourceId: string) {
    inspectZip(bytes);
    const images: { name: string; bytes: Uint8Array; type: string }[] = [];
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) }, {
        externalFileAccess: false,
        styleMap: ['u => u'],
        convertImage: mammoth.images.imgElement(async img => {
            if (images.length >= 50 || !/^image\/(png|jpeg|gif|webp)$/.test(img.contentType)) return { src: 'unsupported-image' };
            const data = new Uint8Array(await img.readAsArrayBuffer());
            const name = `image-${images.length}.${img.contentType.split('/')[1]}`;
            images.push({ name, bytes: data, type: img.contentType });
            return { src: `/api/workspace/media/${sourceId}/${name}` };
        }),
    });
    const lines = htmlToLines(result.value);
    if (lines.join('\n').length > 150000) throw new Error('试卷正文过长，请拆分后上传。');
    const parsed = splitQuestions(lines, grade, name, sourceId);
    if (parsed.questions.some(q => q.type === '听力选择')) parsed.warnings.push('听力题只提取题面与原卷答案；本次未导入听力音频或生成听力材料。');
    if (/<table/.test(result.value)) parsed.warnings.push('文档包含表格，已提取文字；表格布局需对照原卷检查。');
    if (result.value.includes('unsupported-image')) parsed.warnings.push('存在不支持的图片格式或超出 50 张限制，请对照原卷补充。');
    if (result.messages.length) parsed.warnings.push('文档有复杂格式，可能未完整保留；请对照原卷核对。');
    const source: Source = {
        id: sourceId, name: name.slice(0, 240), grade, count: parsed.questions.length,
        createdAt: new Date().toISOString(), text: lines.join('\n'), questions: parsed.questions,
        warnings: parsed.warnings, report: parsed.report, committed: false,
    };
    if (JSON.stringify(source).length > 900000) throw new Error('提取内容过大，请拆分试卷。');
    return { source, images };
}
