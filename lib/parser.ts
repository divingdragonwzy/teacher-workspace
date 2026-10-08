export function inspectZip(buffer: Uint8Array) {
    const v = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let eocd = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
        if (v.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0)
        throw new Error('这不是有效的 .docx 文件；请用 Word 重新另存为 .docx。');
    const count = v.getUint16(eocd + 10, true), offset = v.getUint32(eocd + 16, true);
    if (count > 2000)
        throw new Error('文档内容过于复杂，请拆分后上传。');
    let total = 0, pos = offset, hasDocument = false;
    for (let i = 0; i < count; i++) {
        if (pos + 46 > buffer.length || v.getUint32(pos, true) !== 0x02014b50)
            throw new Error('Word 文件损坏或使用了不支持的 ZIP 格式。');
        const size = v.getUint32(pos + 24, true), len = v.getUint16(pos + 28, true);
        total += size;
        if (total > 24 * 1024 * 1024 || size > 8 * 1024 * 1024)
            throw new Error('Word 解压后过大，请压缩图片或拆分文档。');
        if (v.getUint16(pos + 8, true) & 1)
            throw new Error('请先解除 Word 文档的密码保护。');
        const name = new TextDecoder().decode(buffer.slice(pos + 46, pos + 46 + len));
        if (name === 'word/document.xml')
            hasDocument = true;
        if (/vbaProject\.bin$/i.test(name))
            throw new Error('暂不支持含宏的文档。');
        pos += 46 + len + v.getUint16(pos + 30, true) + v.getUint16(pos + 32, true);
    }
    if (!hasDocument)
        throw new Error('没有找到 Word 正文；请确认上传的是 .docx 试卷。');
}
export { htmlToLines, splitQuestions, PARSER_VERSION } from './question-parser';

