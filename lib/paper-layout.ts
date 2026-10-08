import type { Question } from './model';

export type MaterialImage = { src: string; label?: string };
export type MaterialBlock = { kind: 'text'; text: string } | { kind: 'image'; src: string };

export function sharedMaterialImages(questions: readonly Question[]): MaterialImage[] {
    return [...new Map(questions.flatMap(q => q.images.flatMap((src, i) => q.imageLabels?.[i] === '共用材料配图' ? [[src, { src }] as const] : []))).values()];
}

/** Replace parser-only markers with real images at their original reading position. */
export function materialBlocks(text: string, images: readonly MaterialImage[]): MaterialBlock[] {
    const blocks: MaterialBlock[] = [];
    const unique = [...new Map(images.map(image => [image.src, image])).values()];
    const marker = /[\[【]共用材料配图(?:\s*[，,]\s*见配图)?[\]】]/g;
    let position = 0, imageIndex = 0;
    const appendText = (value: string) => { if (value.trim()) blocks.push({ kind: 'text', text: value.trim() }); };
    for (const match of text.matchAll(marker)) {
        appendText(text.slice(position, match.index));
        if (unique[imageIndex]) blocks.push({ kind: 'image', src: unique[imageIndex++].src });
        else if (!unique.length) appendText('（图片缺失，请核对原卷）');
        position = match.index! + match[0].length;
    }
    appendText(text.slice(position));
    // Older/manual records may have assets but no marker; never silently drop them.
    unique.slice(imageIndex).forEach(image => blocks.push({ kind: 'image', src: image.src }));
    return blocks;
}

/** Conservative visual width: Chinese/full-width glyphs occupy roughly two Latin units. */
export function optionColumns(options: readonly string[]): 1 | 2 | 4 {
    if (options.some(o => /[\r\n]/.test(o))) return 1;
    const widths = options.map(o => Array.from(o).reduce((n, ch) => n + (/[^\u0000-\u024f]/.test(ch) ? 2 : /[MW@%]/.test(ch) ? 1.4 : 1), 0));
    const longest = Math.max(0, ...widths);
    return longest <= 18 ? 4 : longest <= 40 ? 2 : 1;
}

export function optionRows(options: readonly string[]) {
    const columns = optionColumns(options);
    return Array.from({ length: Math.ceil(options.length / columns) }, (_, i) => options.slice(i * columns, (i + 1) * columns));
}
