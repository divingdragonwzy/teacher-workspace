import { z } from 'zod';
import { parseWord } from '@/lib/import-docx';
import { database, files, owner, guarded, response, HttpError, readJSON, questionSchema, paperSchema } from '@/lib/server';
import { inspectZip } from '@/lib/parser';
import { GRADES, type Source, type Question } from '@/lib/model';
type Row = {
    id: string;
    data: string;
    name?: string;
    committed?: number;
    created_at?: string;
};
function pathOf(request: Request) { return new URL(request.url).pathname.split('/').slice(3); }
async function sourceRow(id: string, user: string) { const row = await database().prepare('SELECT * FROM sources WHERE id=? AND owner=?').bind(id, user).first<Row>(); if (!row)
    throw new HttpError(404, '找不到这份试卷。'); return row; }
export async function GET(request: Request) {
    return guarded(async () => {
        const user = await owner(request);
        const [kind, id, key] = pathOf(request);
        const db = database();
        if (kind === 'state') {
            const [qs, ss, ps] = await Promise.all([db.prepare('SELECT data FROM questions WHERE owner=? ORDER BY created_at DESC').bind(user).all<Row>(), db.prepare('SELECT id,name,data,committed,created_at FROM sources WHERE owner=? ORDER BY created_at DESC').bind(user).all<Row>(), db.prepare('SELECT data FROM papers WHERE owner=? ORDER BY updated_at DESC').bind(user).all<Row>()]);
            return response({ questions: qs.results.map(x => JSON.parse(x.data)), sources: ss.results.map(x => { const s = JSON.parse(x.data); return { id: x.id, name: x.name, grade: s.grade, count: s.questions.length, createdAt: x.created_at, committed: !!x.committed }; }), papers: ps.results.map(x => JSON.parse(x.data)) });
        }
        if (kind === 'source') {
            const row = await sourceRow(id, user);
            if (key === 'file') {
                const file = await files().get(`${user}/${id}/original.docx`);
                if (!file)
                    throw new HttpError(404, '原文件暂不可用。');
                return new Response(file.body, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name || 'original.docx')}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } });
            }
            if (key === 'backup') {
                const s = JSON.parse(row.data) as Source;
                if (!s.previousDraft) throw new HttpError(404, '没有历史草稿备份。');
                const backup = await files().get(`${user}/${id}/draft-backups/${s.previousDraft}.json`);
                if (!backup) throw new HttpError(404, '备份暂不可用。');
                return new Response(backup.body, { headers: {
                    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
                    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent((row.name || 'draft') + '_重新识别前草稿.json')}`,
                    'X-Content-Type-Options': 'nosniff',
                } });
            }
            return response({ ...JSON.parse(row.data), committed: !!row.committed });
        }
        if (kind === 'media') {
            await sourceRow(id, user);
            if (!/^[\w.-]+$/.test(key || ''))
                throw new HttpError(400, '图片路径无效。');
            const file = await files().get(`${user}/${id}/${key}`);
            if (!file)
                throw new HttpError(404, '图片不存在。');
            return new Response(file.body, { headers: { 'Content-Type': file.httpMetadata?.contentType || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' } });
        }
        throw new HttpError(404, '接口不存在。');
    });
}
export async function POST(request: Request) {
    return guarded(async () => {
        const user = await owner(request);
        const [kind, id] = pathOf(request);
        const db = database();
        if (kind === 'import') {
            if (Number(request.headers.get('content-length') || 0) > 9 * 1024 * 1024)
                throw new HttpError(413, '单份文档不能超过 8 MB。');
            const form = await request.formData();
            const file = form.get('file'), grade = z.enum(GRADES).parse(form.get('grade'));
            if (!(file instanceof File))
                throw new HttpError(400, '请选择 Word 试卷。');
            if (!/\.docx$/i.test(file.name))
                throw new HttpError(400, '仅支持 .docx，请将旧版 .doc 另存为 .docx。');
            if (file.size > 8 * 1024 * 1024 || file.size < 20)
                throw new HttpError(413, '文件为空或超过 8 MB 限制。');
            const bytes = new Uint8Array(await file.arrayBuffer());
            try {
                inspectZip(bytes);
            }
            catch (e) {
                throw new HttpError(400, (e as Error).message);
            }
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(x => x.toString(16).padStart(2, '0')).join('');
            const existing = await db.prepare('SELECT data,committed FROM sources WHERE owner=? AND hash=?').bind(user, hash).first<Row>();
            if (existing)
                return response({ ...JSON.parse(existing.data), committed: !!existing.committed, duplicate: true });
            const sourceId = crypto.randomUUID();
            let parsed;
            try { parsed = await parseWord(bytes, grade, file.name, sourceId); }
            catch (e) { throw new HttpError(400, (e as Error).message || '无法读取这份 Word。'); }
            const { source, images } = parsed;
            const bucket = files();
            const stored: string[] = [];
            try {
                const original = `${user}/${sourceId}/original.docx`;
                await bucket.put(original, bytes, { httpMetadata: { contentType: file.type } });
                stored.push(original);
                for (const img of images) {
                    const key = `${user}/${sourceId}/${img.name}`;
                    await bucket.put(key, img.bytes, { httpMetadata: { contentType: img.type } });
                    stored.push(key);
                }
                await db.prepare('INSERT INTO sources (id,owner,name,hash,data,committed,created_at) VALUES (?,?,?,?,?,0,?)').bind(sourceId, user, source.name, hash, JSON.stringify(source), source.createdAt).run();
            }
            catch (e) {
                if (stored.length)
                    await bucket.delete(stored);
                throw e;
            }
            return response(source);
        }
        if (kind === 'reparse') {
            const body = z.object({ sourceId: z.string().min(1).max(100) }).parse(await readJSON(request));
            const row = await sourceRow(body.sourceId, user);
            if (row.committed) throw new HttpError(409, '已入库试卷不能重新识别，以免覆盖已审核的题目。');
            const old = JSON.parse(row.data) as Source;
            const original = await files().get(`${user}/${old.id}/original.docx`);
            if (!original) throw new HttpError(404, '原文件暂不可用。');
            let parsed;
            try { parsed = await parseWord(new Uint8Array(await original.arrayBuffer()), old.grade, old.name, old.id); }
            catch (e) { throw new HttpError(400, (e as Error).message || '重新读取失败，原草稿保持不变。'); }
            const backupId = crypto.randomUUID();
            const backupKey = `${user}/${old.id}/draft-backups/${backupId}.json`;
            const value: Source = { ...parsed.source, createdAt: old.createdAt, previousDraft: backupId };
            await files().put(backupKey, row.data, { httpMetadata: { contentType: 'application/json' } });
            // Image keys are deterministic for the immutable original Word file.
            for (const img of parsed.images) await files().put(`${user}/${old.id}/${img.name}`, img.bytes, { httpMetadata: { contentType: img.type } });
            const updated = await db.prepare('UPDATE sources SET data=? WHERE id=? AND owner=? AND committed=0 AND data=?')
                .bind(JSON.stringify(value), old.id, user, row.data).run();
            if (!updated.meta.changes) throw new HttpError(409, '草稿已在其他窗口修改，请刷新后重试。原草稿未被覆盖。');
            return response(value);
        }
        if (kind === 'draft') {
            const body = z.object({ sourceId: z.string(), questions: z.array(questionSchema).max(200) }).parse(await readJSON(request));
            const row = await sourceRow(body.sourceId, user);
            if (row.committed)
                throw new HttpError(409, '这份试卷已经入库。');
            const data = { ...JSON.parse(row.data), questions: body.questions };
            if (JSON.stringify(data).length > 900000)
                throw new HttpError(413, '草稿过大，请减少内容。');
            await db.prepare('UPDATE sources SET data=? WHERE id=? AND owner=? AND committed=0').bind(JSON.stringify(data), body.sourceId, user).run();
            return response({ ok: true });
        }
        if (kind === 'commit') {
            const body = z.object({ sourceId: z.string(), questions: z.array(questionSchema).min(1).max(200) }).parse(await readJSON(request));
            const row = await sourceRow(body.sourceId, user);
            if (row.committed)
                throw new HttpError(409, '这份试卷已入库，请到题库中编辑。');
            const source = JSON.parse(row.data) as Source;
            const now = new Date().toISOString();
            if (new Set(body.questions.map(q => q.id)).size !== body.questions.length)
                throw new HttpError(400, '核对列表中存在重复题目，请移除后再入库。');
            const qs = await Promise.all(body.questions.map(async (q) => { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source.id + ':' + q.id)); const id = 'q-' + Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32); return { ...q, id, sourceId: source.id, source: source.name, status: 'confirmed', createdAt: now }; }));
            const count = await db.prepare('SELECT COUNT(*) as n FROM questions WHERE owner=?').bind(user).first<{
                n: number;
            }>();
            if ((count?.n || 0) + qs.length > 5000)
                throw new HttpError(400, '初版最多保存 5000 道题，请先整理题库。');
            await db.batch([db.prepare('UPDATE sources SET committed=1,data=? WHERE id=? AND owner=? AND committed=0').bind(JSON.stringify({ ...source, questions: qs }), source.id, user), ...qs.map(q => db.prepare('INSERT OR IGNORE INTO questions (id,owner,source_id,data,created_at) VALUES (?,?,?,?,?)').bind(q.id, user, source.id, JSON.stringify(q), now))]);
            return response({ count: qs.length });
        }
        if (kind === 'question') {
            const q = questionSchema.parse(await readJSON(request));
            if (id) {
                const exists = await db.prepare('SELECT id FROM questions WHERE id=? AND owner=?').bind(id, user).first();
                if (!exists)
                    throw new HttpError(404, '题目不存在。');
                const value = { ...q, id, status: 'confirmed' };
                await db.prepare('UPDATE questions SET data=? WHERE id=? AND owner=?').bind(JSON.stringify(value), id, user).run();
                return response(value);
            }
            const count = await db.prepare('SELECT COUNT(*) as n FROM questions WHERE owner=?').bind(user).first<{
                n: number;
            }>();
            if ((count?.n || 0) >= 5000)
                throw new HttpError(400, '初版最多保存 5000 道题，请先整理题库。');
            const now = new Date().toISOString();
            const value = { ...q, id: crypto.randomUUID(), createdAt: now, status: 'confirmed' };
            if (q.sourceId)
                await sourceRow(q.sourceId, user);
            await db.prepare('INSERT INTO questions (id,owner,source_id,data,created_at) VALUES (?,?,?,?,?)').bind(value.id, user, value.sourceId || null, JSON.stringify(value), now).run();
            return response(value);
        }
        if (kind === 'paper') {
            const p = paperSchema.parse(await readJSON(request));
            if (new Set(p.items.map(x => x.question.id)).size !== p.items.length)
                throw new HttpError(400, '同一份试卷不能重复加入相同题目。');
            const existing = await db.prepare('SELECT owner,data FROM papers WHERE id=?').bind(p.id).first<{
                owner: string;
                data: string;
            }>();
            if (existing && existing.owner !== user)
                throw new HttpError(404, '试卷不存在。');
            const oldIds = new Set<string>(existing ? JSON.parse(existing.data).items.map((x: {
                question: {
                    id: string;
                };
            }) => x.question.id) : []);
            for (const item of p.items) {
                if (!oldIds.has(item.question.id) && !await db.prepare('SELECT id FROM questions WHERE id=? AND owner=?').bind(item.question.id, user).first())
                    throw new HttpError(400, '部分题目已不在题库中，请重新选题。');
            }
            const value = { ...p, updatedAt: new Date().toISOString() };
            if (JSON.stringify(value).length > 900000)
                throw new HttpError(413, '试卷过大，请减少题目。');
            await db.prepare('INSERT INTO papers (id,owner,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE papers.owner=excluded.owner').bind(p.id, user, JSON.stringify(value), value.updatedAt).run();
            return response(value);
        }
        throw new HttpError(404, '接口不存在。');
    });
}
export async function DELETE(request: Request) { return guarded(async () => { const user = await owner(request); const [kind, id] = pathOf(request); if (kind === 'question') {
    await database().prepare('DELETE FROM questions WHERE id=? AND owner=?').bind(id, user).run();
    return response({ ok: true });
} if (kind === 'paper') {
    await database().prepare('DELETE FROM papers WHERE id=? AND owner=?').bind(id, user).run();
    return response({ ok: true });
} throw new HttpError(404, '接口不存在。'); }); }
