import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { z } from 'zod';
import { GRADES, TYPES } from './model';
export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function database() { if (!env.DB)
    throw new HttpError(503, '数据库暂不可用，请稍后重试。'); return env.DB; }
export function files() { if (!env.FILES)
    throw new HttpError(503, '文件存储暂不可用，请稍后重试。'); return env.FILES; }
export async function owner(request: Request) { if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new HttpError(403, '请从工作台内进行操作。'); const origin = request.headers.get('origin'); if (request.method !== 'GET' && origin && origin !== new URL(request.url).origin)
    throw new HttpError(403, '请求来源不匹配，请从工作台重新操作。'); const user = await getChatGPTUser(); if (!user)
    throw new HttpError(401, '登录已失效，请刷新页面重新登录。'); return user.userId; }
export function response(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
export async function guarded(fn: () => Promise<Response>) { try {
    return await fn();
}
catch (e) {
    if (e instanceof z.ZodError)
        return response({ error: '内容格式不正确，请检查题干、年级、题型与分值。', details: e.issues.map(x => x.path.join('.')).slice(0, 5) }, 400);
    if (e instanceof HttpError)
        return response({ error: e.message }, e.status);
    console.error('workspace request failed', e);
    return response({ error: '操作未完成，请重试；当前编辑内容仍保留在页面中。' }, 500);
} }
export const questionSchema = z.object({ id: z.string().min(1).max(100), grade: z.enum(GRADES), type: z.enum(TYPES), stem: z.string().trim().min(1).max(30000), options: z.array(z.string().max(5000)).max(12), answer: z.string().max(15000), analysis: z.string().max(15000), knowledge: z.array(z.string().trim().min(1).max(80)).max(20), material: z.string().max(50000), source: z.string().max(255), sourceId: z.string().max(100).optional(), originalNo: z.string().max(100), images: z.array(z.string().regex(/^\/api\/workspace\/media\/[a-zA-Z0-9-]+\/[a-zA-Z0-9._-]+$/)).max(50), imageLabels: z.array(z.string().max(100)).max(50).optional(), status: z.enum(['review', 'confirmed']), warnings: z.array(z.string().max(500)).max(30), createdAt: z.string().optional() });
export const paperSchema = z.object({ id: z.string().min(1).max(100), title: z.string().trim().min(1).max(160), grade: z.enum(GRADES), minutes: z.number().int().min(1).max(300), items: z.array(z.object({ question: questionSchema, score: z.number().finite().min(.5).max(100) })).min(1).max(200), updatedAt: z.string().optional() });
export async function readJSON(request: Request) { if (Number(request.headers.get('content-length') || 0) > 1800000)
    throw new HttpError(413, '一次保存内容过多，请减少题目数量。'); const text = await request.text(); if (text.length > 1500000)
    throw new HttpError(413, '一次保存内容过多，请减少题目数量。'); try {
    return JSON.parse(text);
}
catch {
    throw new HttpError(400, '请求内容无法读取。');
} }
