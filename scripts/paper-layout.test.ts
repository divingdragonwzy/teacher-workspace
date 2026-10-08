import assert from 'node:assert/strict';
import { Packer } from 'docx';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { materialBlocks, optionColumns, optionRows, sharedMaterialImages } from '../lib/paper-layout';
import { buildPaperDocument } from '../lib/export-docx';
import { blankQuestion, type Paper } from '../lib/model';

const images = [{ src: '/one.png' }, { src: '/one.png' }, { src: '/two.png' }];
const saved = JSON.stringify(images);
assert.deepEqual(materialBlocks('Before [共用材料配图，见配图] Middle 【共用材料配图】 After', images), [
    { kind: 'text', text: 'Before' }, { kind: 'image', src: '/one.png' }, { kind: 'text', text: 'Middle' }, { kind: 'image', src: '/two.png' }, { kind: 'text', text: 'After' },
]);
assert.equal(JSON.stringify(images), saved);
assert.deepEqual(materialBlocks('Legacy passage', images).map(b => b.kind), ['text', 'image', 'image']);
assert.match(JSON.stringify(materialBlocks('[共用材料配图，见配图]', [])), /图片缺失/);
assert.equal(optionColumns(['A. cat', 'B. dog', 'C. pig', 'D. hen']), 4);
assert.equal(optionColumns(['A. a reasonably long choice']), 2);
assert.equal(optionColumns(['A. ' + 'long '.repeat(12)]), 1);
assert.equal(optionColumns(['A. line one\nline two']), 1);
assert.equal(optionColumns(['A. 一二三四五六七八九十']), 2);
assert.deepEqual(optionRows(['A. a reasonably long choice', 'B. a', 'C. b', 'D. c']).map(row => row.length), [2, 2]);

const paper: Paper = { id: 'layout', title: '排版测试', grade: '七年级', minutes: 30, items: [16, 17].map((number, i) => ({ score: 2,
    question: { ...blankQuestion(), id: `layout-${number}`, sourceId: 'layout-source', type: '完形填空', originalNo: String(number),
        material: 'Before illustration.\n[共用材料配图，见配图]\nAfter illustration. 16.__ 17.__', stem: `第 ${number} 空（见共用材料）`,
        images: ['/one.png'], imageLabels: ['共用材料配图'], options: ['A. cat', 'B. dog', 'C. pig', 'D. hen'], answer: i ? 'B' : 'A' }
})) };
assert.equal(sharedMaterialImages(paper.items.map(i => i.question)).length, 1);
const source = JSON.stringify(paper);
const oldFetch = globalThis.fetch, oldBitmap = globalThis.createImageBitmap;
globalThis.fetch = (async () => new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l3sAAAAASUVORK5CYII=', 'base64'), { headers: { 'Content-Type': 'image/png' } })) as typeof fetch;
globalThis.createImageBitmap = (async () => ({ width: 1, height: 1, close() {} })) as typeof createImageBitmap;
try {
    for (const answers of [false, true]) {
        const buffer = await Packer.toBuffer(await buildPaperDocument(paper, answers));
        const zip = await JSZip.loadAsync(buffer);
        const xml = await zip.file('word/document.xml')!.async('string');
        const text = (await mammoth.extractRawText({ buffer })).value;
        assert.ok(xml.indexOf('Before illustration.') < xml.indexOf('<w:drawing>'));
        assert.ok(xml.indexOf('<w:drawing>') < xml.indexOf('After illustration.'));
        assert.equal((xml.match(/<w:drawing>/g) || []).length, 1);
        assert.doesNotMatch(text, /共用材料配图|见配图|（2 分）|16\.__|17\.__/);
        assert.match(text, /满分 4 分/); assert.match(text, /共 4 分/);
        assert.match(text, /1\.\tA\. cat\tB\. dog\tC\. pig\tD\. hen/);
        assert.match(text, /2\.\tA\. cat\tB\. dog\tC\. pig\tD\. hen/);
        assert.match(xml, /w:tab w:val="left" w:pos="480"/);
        if (answers) { assert.match(text, /参考答案与解析/); assert.match(text, /1\. A\n/); assert.match(text, /2\. B\n/); }
        else assert.doesNotMatch(text, /参考答案与解析/);
    }
} finally { globalThis.fetch = oldFetch; globalThis.createImageBitmap = oldBitmap; }
assert.equal(JSON.stringify(paper), source);
console.log('PASS: inline images keep source order without captions/duplication; local numbering; no child scores; big totals retained; compact tab-aligned choices; medium/long/multiline width rules; student/teacher answers; source immutable.');
