'use client';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BookOpen, Layers, FilePlus2, Upload, Search, Plus, ChevronDown, ChevronUp, Check, FileText, GraduationCap, Download, Trash2, Pencil, Eye, ArrowUp, ArrowDown, ArrowRight, X, Loader2, AlertCircle, Save, FolderOpen, ChevronLeft, CheckCircle2, RefreshCw, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { GRADES, TYPES, KNOWLEDGE, blankQuestion, demoQuestions, type Grade, type Question, type Source, type State, type Paper, type PaperItem } from '@/lib/model';
import { buildQuestionUnits, filterQuestionUnits, buildPaperUnits, unitSelection, toggleQuestionUnit, removePaperUnit, movePaperUnit, unitHeading, isBlankPlaceholder, type QuestionUnit } from '@/lib/question-units';
import { materialBlocks, sharedMaterialImages, optionColumns, type MaterialImage } from '@/lib/paper-layout';
async function api<T>(path: string, body?: unknown, method?: string): Promise<T> { const result = await fetch('/api/workspace/' + path, { method: method || (body ? 'POST' : 'GET'), headers: body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }); const data = await result.json() as T & {
    error?: string;
}; if (!result.ok)
    throw new Error(data.error || '操作未完成，请重试。'); return data; }
function Picker({ value, onChange, items, label }: {
    value: string;
    onChange: (v: string) => void;
    items: readonly string[];
    label: string;
}) { return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{items.map(v => <SelectItem value={v} key={v}>{v}</SelectItem>)}</SelectContent></Select>; }
function Blank({ title, description, children }: {
    title: string;
    description: string;
    children?: React.ReactNode;
}) { return <Empty className="empty-state"><EmptyHeader><EmptyMedia variant="icon"><BookOpen /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{children}</Empty>; }
function Navigation({ view, onView, count }: {
    view: string; onView: (v: View) => void; count: number;
}) {
    const { setOpenMobile } = useSidebar();
    const nav = [
        { icon: Layers, title: '我的题库', view: 'bank' as View },
        { icon: Upload, title: '导入试卷', view: 'import' as View },
        { icon: FilePlus2, title: '组卷工作台', view: 'paper' as View },
    ];
    return <Sidebar>
        <SidebarHeader><div className="brand"><BookOpen size={22}/><span>拾题</span></div><p className="brand-subtitle">初中英语 · 教师工作台</p></SidebarHeader>
        <SidebarContent><SidebarMenu>{nav.map(({ icon: Icon, title, view: v }) => <SidebarMenuItem key={v}>
            <SidebarMenuButton isActive={view === v || (view === 'review' && v === 'import')} onClick={() => { onView(v); setOpenMobile(false); }}>
                <Icon />{title}{v === 'paper' && count > 0 && <span className="nav-count">{count}</span>}
            </SidebarMenuButton>
        </SidebarMenuItem>)}</SidebarMenu></SidebarContent>
        <SidebarFooter><p className="local-note">本地版 · 数据保存在本机</p></SidebarFooter>
    </Sidebar>;
}
type View = 'bank' | 'import' | 'review' | 'paper';
type Group = { material: string; items: { q: Question; index: number }[] };
function groupByMaterial(list: Question[], offset = 0): Group[] {
    const groups: Group[] = [];
    list.forEach((q, i) => {
        const key = q.material.trim();
        const last = groups.at(-1);
        const prev = last?.items.at(-1)?.q;
        if (key && last && last.material === key && (prev?.sourceId || prev?.source) === (q.sourceId || q.source)) {
            last.items.push({ q, index: offset + i });
        } else groups.push({ material: key, items: [{ q, index: offset + i }] });
    });
    return groups;
}
function MaterialContent({ text, images }: { text: string; images: MaterialImage[] }) {
    return <>{materialBlocks(text, images).map((block, i) => block.kind === 'image' ? <img className="material-image" key={i} src={block.src} alt="插图"/> : <div className="material-text" key={i}>{block.text}</div>)}</>;
}
function MaterialHeader({ group, continued, images }: { group: Group; continued: boolean; images?: MaterialImage[] }) {
    const [expanded, setExpanded] = useState(false);
    const [overflow, setOverflow] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const id = useId();
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const measure = () => setOverflow(element.scrollHeight > parseFloat(getComputedStyle(element).lineHeight) * 3 + 2);
        const observer = new ResizeObserver(measure);
        observer.observe(element); element.addEventListener('load', measure, true); measure();
        return () => { observer.disconnect(); element.removeEventListener('load', measure, true); };
    }, [group.material]);
    const first = group.items[0], last = group.items.at(-1)!;
    return <div className="material-header">
        <div className="material-caption">共用材料 · 第 {first.index + 1}{first.index !== last.index ? `–${last.index + 1}` : ''} 题{continued ? '（续）' : ''} · {first.q.source}</div>
        <div className="material-copy"><div ref={ref} id={id} className={`material-flow ${expanded ? 'expanded' : 'clamped'}`}><MaterialContent text={group.material} images={images ?? sharedMaterialImages(group.items.map(item => item.q))}/></div>
            {overflow && <Button variant="ghost" size="sm" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : '展开全文'}{expanded ? <ChevronUp /> : <ChevronDown />}</Button>}
        </div>
    </div>;
}
function QuestionGroups({ list, offset = 0, previous, renderItem }: {
    list: Question[]; offset?: number; previous?: Question;
    renderItem: (q: Question, index: number, grouped: boolean) => ReactNode;
}) {
    return <>{groupByMaterial(list, offset).map((group, i) => group.material ? <section className="material-group" key={group.items[0].q.id}>
        <MaterialHeader group={group} continued={i === 0 && !!previous && previous.material.trim() === group.material && (previous.sourceId || previous.source) === (group.items[0].q.sourceId || group.items[0].q.source)}/>
        {group.items.map(({ q, index }) => renderItem(q, index, true))}
    </section> : group.items.map(({ q, index }) => renderItem(q, index, false)))}</>;
}
function QuestionImages({ q, hideShared = false }: { q: Question; hideShared?: boolean }) {
    const images = q.images.map((src, i) => ({ src, label: q.imageLabels?.[i] })).filter(image => !hideShared || image.label !== '共用材料配图');
    return images.length ? <div className="question-images">{images.map(({ src, label }) => <figure key={src}><img src={src} alt={label && label !== '共用材料配图' ? label : '插图'} loading="lazy"/>{label && label !== '共用材料配图' && <figcaption>{label}</figcaption>}</figure>)}</div> : null;
}
function UnitWarnings({ unit }: { unit: QuestionUnit }) {
    return <>{unit.numberingIssues.map(message => <div className="small-warning" role="alert" key={message}><AlertCircle size={14}/>{message}</div>)}</>;
}
function BankUnit({ unit, index, items, onChoose, onEdit, onDelete }: {
    unit: QuestionUnit; index: number; items: PaperItem[];
    onChoose: () => void; onEdit: (q: Question) => void; onDelete: (q: Question) => void;
}) {
    const selection = unitSelection(items, unit);
    if (!unit.composite) return <QuestionCard q={unit.display[0]} index={index} chosen={selection === 'all'} onChoose={onChoose} onEdit={() => onEdit(unit.questions[0])} onDelete={() => onDelete(unit.questions[0])}/>;
    return <section className={`material-group bank-unit${selection === 'all' ? ' unit-selected' : ''}`} aria-label={`${unit.questions[0].type}大题 · ${unit.questions[0].source}`}>
        <div className="unit-toolbar"><div><strong>{unit.questions[0].type}</strong><span>{unit.questions.length} 小题 · 内部编号 1–{unit.questions.length}</span></div>
            <Button className="choose-button" variant="outline" size="sm" data-chosen={selection === 'all'} aria-pressed={selection === 'all'} aria-label={`${selection === 'all' ? '移出' : '加入'}整道${unit.questions[0].type}（${unit.questions.length}小题）`} onClick={onChoose}>{selection === 'all' ? <Check/> : <Plus/>}{selection === 'all' ? '已加入整题' : selection === 'partial' ? '补齐整题' : '加入整题'}</Button>
        </div>
        <MaterialHeader group={{ material: unit.material, items: unit.display.map((q, i) => ({ q, index: i })) }} continued={false} images={unit.sharedImages}/>
        <div className="unit-shared"><UnitWarnings unit={unit}/></div>
        {unit.display.map((q, i) => <QuestionCard key={q.id} q={q} index={i} grouped chosen={items.some(item => item.question.id === q.id)} onEdit={() => onEdit(unit.questions[i])} onDelete={() => onDelete(unit.questions[i])}/>)}
    </section>;
}
function mergedImages(a: Question, b: Question) {
    const images = [...new Set([...a.images, ...b.images])];
    return { images, imageLabels: images.map(src => a.images.includes(src) ? a.imageLabels?.[a.images.indexOf(src)] || '题目配图' : b.imageLabels?.[b.images.indexOf(src)] || '题目配图') };
}
function QuestionOptions({ options }: { options: string[] }) {
    if (!options.length) return null;
    const columns = optionColumns(options);
    return <div className={`options-grid ${columns === 4 ? 'options-short' : columns === 2 ? 'options-medium' : 'options-long'}`}>{options.map((o, i) => {
        const match = o.match(/^([A-H][.．、)）])\s*([\s\S]*)$/);
        return <span key={i}>{match ? <><b>{match[1]}</b> {match[2]}</> : o}</span>;
    })}</div>;
}
function QuestionCard({ q, index, chosen, onChoose, onEdit, onDelete, review, onMerge, grouped }: {
    q: Question; index: number; chosen?: boolean; grouped?: boolean; review?: boolean;
    onChoose?: () => void; onEdit?: () => void; onDelete?: () => void; onMerge?: () => void;
}) {
    const [answer, setAnswer] = useState(false);
    const metadata = [q.type, q.grade, ...[...new Set(q.knowledge)].filter(k => k !== q.type)];
    return <article className={`question-card${chosen ? ' selected' : ''}${grouped ? ' grouped' : ''}${review && (!q.answer || q.warnings.length) ? ' needs-review' : ''}`}>
        <div className="q-number">{String(index + 1).padStart(2, '0')}</div>
        <div className="question-content">
            <div className="question-top"><div className="question-meta"><span>{metadata.join(' · ')}</span>{review && !q.answer && <span className="warning-tag">待补充答案</span>}</div>
                {onChoose && <Button className="choose-button" data-chosen={!!chosen} variant="outline" size="sm" aria-pressed={!!chosen} aria-label={chosen ? `从试卷移出第${index + 1}题` : `加入第${index + 1}题到试卷`} onClick={onChoose}>{chosen ? <Check /> : <Plus />}{chosen ? '已加入' : '加入'}</Button>}
            </div>
            <div className="question-stem">{q.stem}</div><QuestionImages q={q} hideShared={grouped}/><QuestionOptions options={q.options}/>
            {answer && <div className="answer-block"><strong>答案：{q.answer || '未填写，请补充'}</strong>{q.analysis && <p>{q.analysis}</p>}</div>}
            {review && q.warnings.length > 0 && <div className="small-warning"><AlertCircle size={14}/>{q.warnings.join('；')}</div>}
            <div className="question-footer"><span title={q.source}>{q.source}{q.originalNo ? ` · 原题 ${q.originalNo}` : ''}</span><div className="card-actions">
                <Button variant="ghost" size="sm" aria-expanded={answer} aria-label={answer ? '收起答案' : '查看答案'} onClick={() => setAnswer(!answer)}>{answer ? '收起答案' : '答案'}</Button>
                {onMerge && <Button variant="ghost" size="sm" onClick={onMerge}>合并下一题</Button>}
                {onEdit && <Button className="quiet-action" variant="ghost" size="icon-sm" aria-label={`编辑第${index + 1}题`} onClick={onEdit}><Pencil /></Button>}
                {onDelete && <Button className="quiet-action" variant="ghost" size="icon-sm" aria-label={`删除第${index + 1}题`} onClick={onDelete}><Trash2 /></Button>}
            </div></div>
        </div>
    </article>;
}
function Editor({ question, onClose, onSave }: {
    question: Question;
    onClose: () => void;
    onSave: (q: Question) => Promise<void>;
}) { const [q, setQ] = useState({ ...question }); const [knowledge, setKnowledge] = useState(q.knowledge.join('；')); const [options, setOptions] = useState(q.options.join('\n')); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); async function save() { if (!q.stem.trim()) {
    setError('请填写题干。');
    return;
} setBusy(true); setError(''); try {
    await onSave({ ...q, stem: q.stem.trim(), options: options.split('\n').map(s => s.trim()).filter(Boolean), knowledge: [...new Set(knowledge.split(/[；;,，\n]/).map(s => s.trim()).filter(Boolean))], warnings: [], status: 'confirmed' });
    onClose();
}
catch (e) {
    setError((e as Error).message);
}
finally {
    setBusy(false);
} } return <Dialog open onOpenChange={v => { if (!v && !busy)
    onClose(); }}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>编辑题目</DialogTitle><DialogDescription>核对题干、答案和分类。英语学科固定，共用材料会随题目一起组卷。</DialogDescription></DialogHeader><div className="editor-fields"><div className="form-row"><div className="field"><Label>年级</Label><Picker value={q.grade} onChange={v => setQ({ ...q, grade: v as Grade })} items={GRADES} label="题目年级"/></div><div className="field"><Label>题型</Label><Picker value={q.type} onChange={v => setQ({ ...q, type: v as Question['type'] })} items={TYPES} label="题型"/></div></div><div className="field"><Label htmlFor="q-stem">题干 *</Label><Textarea id="q-stem" rows={5} value={q.stem} onChange={e => setQ({ ...q, stem: e.target.value })}/></div><div className="field"><Label htmlFor="q-options">选项（每行一个，无选项可留空）</Label><Textarea id="q-options" rows={4} value={options} onChange={e => setOptions(e.target.value)} placeholder={'A. go\nB. goes\nC. going\nD. went'}/></div><div className="form-row"><div className="field"><Label htmlFor="q-answer">标准答案</Label><Textarea id="q-answer" rows={3} value={q.answer} onChange={e => setQ({ ...q, answer: e.target.value })} placeholder="未提供的答案不会自动编写"/></div><div className="field"><Label htmlFor="q-analysis">答案解析</Label><Textarea id="q-analysis" rows={3} value={q.analysis} onChange={e => setQ({ ...q, analysis: e.target.value })}/></div></div><div className="field"><Label htmlFor="q-knowledge">知识点（多个知识点用分号分隔）</Label><Input id="q-knowledge" value={knowledge} onChange={e => setKnowledge(e.target.value)} placeholder="一般现在时；主谓一致"/><div className="knowledge-suggestions">{KNOWLEDGE.slice(0, 12).map(k => <button key={k} type="button" onClick={() => setKnowledge(knowledge ? `${knowledge}；${k}` : k)}>{k}</button>)}</div></div><div className="field"><Label htmlFor="q-material">共用材料（阅读文章、完形填空材料）</Label><Textarea id="q-material" rows={5} value={q.material} onChange={e => setQ({ ...q, material: e.target.value })}/></div>{q.images.length > 0 && <div className="field"><Label>配图</Label><div className="image-editor">{q.images.map((src, i) => <div key={src}><img src={src} alt="配图预览"/><span>{q.imageLabels?.[i] || '题目配图'}</span><Button variant="outline" size="sm" onClick={() => setQ({ ...q, images: q.images.filter((_, n) => n !== i), imageLabels: q.imageLabels?.filter((_, n) => n !== i) })}>移除此配图</Button></div>)}</div></div>}</div>{error && <div className="error-banner" role="alert">{error}</div>}<DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button onClick={save} disabled={busy}>{busy ? <Loader2 className="animate-spin"/> : <Check />}保存题目</Button></DialogFooter></DialogContent></Dialog>; }
function Workspace() {
    const [view, setView] = useState<View>('bank');
    const [search, setSearch] = useState('');
    const [grade, setGrade] = useState('全部年级');
    const [type, setType] = useState('全部题型');
    const [knowledge, setKnowledge] = useState('全部知识点');
    const [page, setPage] = useState(1);
    const query = useQuery<State>({ queryKey: ['workspace'], queryFn: () => api<State>('state'), retry: 1 });
    const state = query.data || { questions: [], sources: [], papers: [] };
    const [paper, setPaper] = useState<Paper>(() => ({ id: '', title: '初中英语练习卷', grade: '七年级', minutes: 45, items: [] }));
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState('');
    const [importGrade, setImportGrade] = useState<Grade>('七年级');
    const [drag, setDrag] = useState(false);
    const [fileError, setFileError] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);
    const [source, setSource] = useState<Source | null>(null);
    const [drafts, setDrafts] = useState<Question[]>([]);
    const [draftDirty, setDraftDirty] = useState(false);
    const [ack, setAck] = useState(false);
    const [editor, setEditor] = useState<{
        q: Question;
        context: 'bank' | 'draft';
        isNew?: boolean;
    } | null>(null);
    const [confirm, setConfirm] = useState<{
        title: string;
        description: string;
        action: () => Promise<void>;
    } | null>(null);
    const [preview, setPreview] = useState(false);
    const [previewAnswers, setPreviewAnswers] = useState(false);
    useEffect(() => { setPage(1); }, [search, grade, type, knowledge]);
    useEffect(() => { function warn(e: BeforeUnloadEvent) { if (dirty || draftDirty || editor) {
        e.preventDefault();
        e.returnValue = '';
    } } window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty, draftDirty, editor]);
    useEffect(() => { const p = new URLSearchParams(window.location.search).get('view'); if (['bank', 'import', 'paper'].includes(p || ''))
        setView(p as View); }, []);
    function go(v: View) { setView(v); const url = new URL(window.location.href); url.searchParams.set('view', v); window.history.replaceState(null, '', url); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    function updatePaper(value: Partial<Paper>) { setPaper(p => ({ ...p, ...value, id: p.id || crypto.randomUUID() })); setDirty(true); }
    function choose(unit: QuestionUnit) {
        try { updatePaper({ items: toggleQuestionUnit(paper.items, unit) }); }
        catch (error) { toast.error((error as Error).message); }
    }
    async function perform(name: string, fn: () => Promise<void>) { setBusy(name); try {
        await fn();
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy('');
    } }
    const bankUnits = useMemo(() => buildQuestionUnits(state.questions), [state.questions]);
    const filtered = useMemo(() => filterQuestionUnits(bankUnits, { grade, type, knowledge, search }), [bankUnits, grade, type, knowledge, search]);
    const paperUnits = useMemo(() => buildPaperUnits(paper.items), [paper.items]);
    useEffect(() => { setPage(p => Math.min(p, Math.max(1, Math.ceil(filtered.length / 10)))); }, [filtered.length]);
    const tags = useMemo(() => [...new Set([...KNOWLEDGE, ...state.questions.flatMap(q => q.knowledge)])], [state.questions]);
    const total = paper.items.reduce((n, i) => n + i.score, 0);
    const title = { bank: '我的题库', import: '导入试卷', review: '拆题与核对', paper: '组卷工作台' }[view];
    async function upload(file: File) { if (draftDirty) {
        setFileError('当前核对内容尚未保存，请先返回核对页保存草稿。');
        return;
    } if (!/\.docx$/i.test(file.name)) {
        setFileError('仅支持 .docx 文件。旧版 .doc 请先在 Word 中另存为 .docx。');
        return;
    } if (file.size > 8 * 1024 * 1024) {
        setFileError('单份文件不能超过 8 MB，请压缩图片后重试。');
        return;
    } setFileError(''); setBusy('upload'); try {
        const form = new FormData();
        form.append('file', file);
        form.append('grade', importGrade);
        const s = await api<Source & {
            duplicate?: boolean;
        }>('import', form);
        await query.refetch();
        if (s.committed) {
            setSearch(s.name);
            setGrade('全部年级');
            setType('全部题型');
            setKnowledge('全部知识点');
            go('bank');
            toast.info('这份文档已入库，已为你定位来源题目。');
            return;
        }
        setSource(s);
        setDrafts(s.questions || []);
        setDraftDirty(false);
        setAck(false);
        go('review');
        if (s.duplicate)
            toast.info('这份文档已上传，继续核对即可。');
    }
    catch (e) {
        setFileError((e as Error).message);
    }
    finally {
        setBusy('');
        if (fileInput.current)
            fileInput.current.value = '';
    } }
    async function openSource(s: Source) { if (draftDirty && source?.id !== s.id) {
        toast.error('请先保存当前核对草稿。');
        return;
    } await perform('source', async () => { const full = await api<Source>('source/' + s.id); if (full.committed) {
        setSearch(full.name);
        setGrade('全部年级');
        setType('全部题型');
        setKnowledge('全部知识点');
        go('bank');
    }
    else {
        setSource(full);
        setDrafts(full.questions || []);
        setDraftDirty(false);
        setAck(false);
        go('review');
    } }); }
    function reparseSource() {
        if (!source) return;
        if (draftDirty) { toast.error('请先保存当前核对草稿，再重新识别。'); return; }
        setConfirm({
            title: '使用新版规则重新识别？',
            description: '将从原始 Word 重新生成待核对题目，替换当前草稿。当前已保存草稿会自动备份，可下载；原卷和已入库题库不受影响。',
            action: async () => {
                const s = await api<Source>('reparse', { sourceId: source.id });
                setSource(s); setDrafts(s.questions || []); setDraftDirty(false); setAck(false);
                await query.refetch();
                toast.success(`已重新识别 ${s.questions?.length || 0} 道题，旧草稿已备份，请重新核对。`);
            },
        });
    }
    async function saveDraft() { if (!source)
        return; await api('draft', { sourceId: source.id, questions: drafts }); setDraftDirty(false); toast.success('核对草稿已保存。'); }
    async function commit() { if (!source || !ack || !drafts.length)
        return; await perform('commit', async () => { await api('commit', { sourceId: source.id, questions: drafts }); setDraftDirty(false); setSource(null); setDrafts([]); setAck(false); await query.refetch(); go('bank'); toast.success(`已将 ${drafts.length} 道题保存到题库。`); }); }
    async function saveQuestion(q: Question) { if (editor?.context === 'draft') {
        setDrafts(list => editor.isNew ? [...list, q] : list.map(x => x.id === q.id ? q : x));
        setDraftDirty(true);
        setAck(false);
        return;
    } await api(editor?.isNew ? 'question' : 'question/' + q.id, q); await query.refetch(); toast.success('题目已保存。'); }
    async function savePaper() { if (!paper.items.length) {
        toast.error('请先选择题目。');
        return;
    } if (!paper.title.trim()) {
        toast.error('请填写试卷名称。');
        return;
    } await perform('save-paper', async () => { const p = await api<Paper>('paper', { ...paper, id: paper.id || crypto.randomUUID() }); setPaper(p); setDirty(false); await query.refetch(); toast.success('试卷已保存，题目快照不会随题库修改而变化。'); }); }
    async function exportPaper(answers: boolean) { if (!paper.items.length) {
        toast.error('请先选择题目。');
        return;
    } await perform('export', async () => { const { downloadPaper } = await import('@/lib/export-docx'); await downloadPaper(paper, answers); toast.success(answers ? '教师答案已生成，请在浏览器中保存 Word 文件。' : '学生试卷已生成，请在浏览器中保存 Word 文件。'); }); }
    function removeQuestion(q: Question, context: 'bank' | 'draft') { setConfirm({ title: context === 'draft' ? '移除这道待入库题目？' : '删除题库中的这道题？', description: context === 'draft' ? '只从本次核对列表移除，原始 Word 文件保持不变。' : '此操作不能撤销；已经保存的试卷仍保留原题快照。', action: async () => { if (context === 'draft') {
            setDrafts(d => d.filter(x => x.id !== q.id));
            setDraftDirty(true);
            setAck(false);
        }
        else {
            await api('question/' + q.id, undefined, 'DELETE');
            await query.refetch();
        } toast.success('题目已移除。'); } }); }
    function openPaper(p: Paper) { const action = async () => { setPaper(structuredClone(p)); setDirty(false); go('paper'); }; if (dirty)
        setConfirm({ title: '放弃当前未保存的组卷修改？', description: '打开另一份试卷会替换当前组卷篮，请先保存需要保留的内容。', action });
    else
        void action(); }
    function newPaper() { const action = async () => { setPaper({ id: crypto.randomUUID(), title: '初中英语练习卷', grade: '七年级', minutes: 45, items: [] }); setDirty(false); }; if (dirty || paper.items.length)
        setConfirm({ title: '开始一份新试卷？', description: dirty ? '当前未保存的组卷修改将被清空。' : '已保存的试卷仍可在下方重新打开。', action });
    else
        void action(); }
    function move(index: number, step: number) { updatePaper({ items: movePaperUnit(paper.items, index, step) }); }
    useEffect(() => { const context = (document as Document & {
        modelContext?: {
            registerTool: (tool: unknown, options: unknown) => void;
        };
    }).modelContext; if (!context?.registerTool)
        return; const lifecycle = new AbortController(); try {
        context.registerTool({ name: 'search_english_questions', title: '查找初中英语题目', description: '检索当前账号已入库的英语题目，并同步工作台的题干搜索与年级筛选。不会修改题库。', inputSchema: { type: 'object', properties: { query: { type: 'string' }, grade: { type: 'string', enum: ['全部年级', ...GRADES] } }, required: ['query'], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input: unknown) => { const v = input as {
                query?: unknown;
                grade?: unknown;
            }; if (typeof v?.query !== 'string' || v.query.length > 200 || v.grade !== undefined && !['全部年级', ...GRADES].includes(String(v.grade)))
                throw new Error('搜索条件无效'); setSearch(v.query); setGrade(String(v.grade || '全部年级')); setType('全部题型'); setKnowledge('全部知识点'); go('bank'); const data = await api<State>('state'); return { questions: data.questions.filter(q => (!v.grade || v.grade === '全部年级' || q.grade === v.grade) && `${q.stem} ${q.material} ${q.knowledge.join(' ')} ${q.source}`.toLowerCase().includes(String(v.query).toLowerCase())).map(q => ({ id: q.id, stem: q.stem, grade: q.grade, type: q.type })).slice(0, 20) }; } }, { signal: lifecycle.signal });
    }
    catch { /* Optional browser standard. */ } return () => lifecycle.abort(); }, []);
    return <SidebarProvider style={{ '--sidebar-width': '220px' } as React.CSSProperties}><Navigation view={view} onView={go} count={paperUnits.length}/><SidebarInset><main className={`workspace view-${view}`}><div className="page-title"><div className="page-heading"><SidebarTrigger className="mobile-sidebar-trigger"/><div><div className="title-line"><h1>{title}</h1><span className="subject-label">初中 · 英语</span></div>{view === 'bank' ? <p className="inline-stats">{query.isPending ? '正在读取…' : <><b>{bankUnits.length}</b> 道整题 · <b>{state.questions.length}</b> 小题 · <b>{state.sources.length}</b> 份来源试卷 · <b>{state.papers.length}</b> 份已存试卷</>}</p> : <p>{view === 'import' ? '上传 Word 试卷，核对后整理进你的英语题库。' : view === 'review' ? '对照原文核对题目，确认后再入库。' : '选好题，排好序，生成一份属于你的试卷。'}</p>}</div></div><div className="title-actions">{view === 'bank' && <><Button variant="outline" onClick={() => setEditor({ q: blankQuestion(), context: 'bank', isNew: true })}><Plus />手动录题</Button><Button onClick={() => go('import')}><Upload />导入 Word 试卷</Button></>}{view === 'import' && source && <Button variant="outline" onClick={() => go('review')}>继续核对草稿</Button>}{view === 'review' && <Button variant="outline" onClick={() => go('import')}><ChevronLeft />返回导入</Button>}{view === 'paper' && <><Button variant="outline" onClick={newPaper}><Plus />新建试卷</Button><Button variant="outline" onClick={savePaper} disabled={!!busy || !paper.items.length}><Save />{busy === 'save-paper' ? '保存中…' : '保存试卷'}</Button></>}</div></div>
 {query.isError && <div className="error-banner" role="alert"><AlertCircle size={18}/><span>{query.error.message}</span><Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw />重试</Button></div>}
 {view === 'bank' && <><div className="bank-layout"><section className="bank-results"><div className="filter-panel"><div className="search-row"><Search size={18}/><Input aria-label="搜索题目" placeholder="搜索题干、知识点或来源试卷" value={search} onChange={e => setSearch(e.target.value)}/>{search && <Button size="icon-sm" variant="ghost" aria-label="清除搜索" onClick={() => setSearch('')}><X /></Button>}</div><div className="filter-row"><Tabs value={grade} onValueChange={setGrade}><TabsList className="grade-tabs">{['全部年级', ...GRADES].map(g => <TabsTrigger key={g} value={g}>{g === '全部年级' ? '全部' : g}</TabsTrigger>)}</TabsList></Tabs><div className="filter-selects"><Picker value={type} onChange={setType} items={['全部题型', ...TYPES]} label="筛选题型"/><Picker value={knowledge} onChange={setKnowledge} items={['全部知识点', ...tags]} label="筛选知识点"/>{(search || grade !== '全部年级' || type !== '全部题型' || knowledge !== '全部知识点') && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setGrade('全部年级'); setType('全部题型'); setKnowledge('全部知识点'); }}>重置</Button>}</div></div></div><div className="list-caption"><strong>共 {filtered.length} 道整题 · {filtered.reduce((n, u) => n + u.questions.length, 0)} 小题</strong><span>整篇选入 · 大题不跨页拆分</span></div>{query.isPending ? <div className="loading"><Loader2 className="animate-spin"/>正在读取题库…</div> : !state.questions.length ? <><Blank title="你的第一道好题，从这里开始" description="上传一份 Word 试卷，或先录入一道题。题目确认后会保存在你的工作空间中。"><div className="flex gap-3"><Button onClick={() => go('import')}><Upload />导入试卷</Button><Button variant="outline" disabled={!!busy || query.isError} onClick={() => perform('demo', async () => { for (const q of demoQuestions())
        await api('question', q); await query.refetch(); toast.success('已添加 3 道明确标注的示例题。'); })}>载入 3 道示例题</Button></div></Blank><div className="list-caption"><strong>题目预览</strong><span>系统示例 · 尚未入库</span></div><QuestionCard q={demoQuestions()[0]} index={0}/></> : !filtered.length ? <Blank title="没有找到符合条件的题目" description="试着更换关键词，或放宽年级、知识点和题型条件。"/> : filtered.slice((page - 1) * 10, page * 10).map((unit, i) => <BankUnit key={unit.id} unit={unit} index={(page - 1) * 10 + i} items={paper.items} onChoose={() => choose(unit)} onEdit={q => setEditor({ q, context: 'bank' })} onDelete={q => removeQuestion(q, 'bank')}/>)}{filtered.length > 10 && <div className="pagination"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</Button><span>{page} / {Math.ceil(filtered.length / 10)}</span><Button variant="outline" size="sm" disabled={page >= Math.ceil(filtered.length / 10)} onClick={() => setPage(p => p + 1)}>下一页</Button></div>}</section><aside className="basket"><div className="basket-header"><FilePlus2 size={18}/><strong>组卷篮</strong><span>{paperUnits.length} 整题</span></div>{!paper.items.length ? <div className="basket-empty"><Layers size={30}/><p>完形、阅读等按「加入整题」一次选入整篇</p></div> : <><div className="basket-summary"><span><b>{paperUnits.length}</b> 整题 · {paper.items.length} 小题 · <b>{total}</b> 分</span></div><div className="basket-list">{paperUnits.map((unit, n) => <div key={unit.id}><span>{n + 1}</span><p title={unit.material || unit.display[0].stem}>{unit.composite ? `${unit.questions[0].type} · ${unit.questions.length} 小题` : unit.display[0].stem}</p><Button variant="ghost" size="icon-sm" aria-label={`从试卷移除第${n + 1}题`} title="移除整题" onClick={() => updatePaper({ items: removePaperUnit(paper.items, unit) })}><X/></Button></div>)}</div><div className="basket-cta"><Button onClick={() => go('paper')}>去排版 <ArrowRight /></Button><p className={dirty ? 'unsaved' : ''}>{dirty ? '尚未保存，请在组卷工作台保存' : '已保存的试卷内容'}</p></div></>}</aside></div></>}
 {view === 'import' && <><div className="steps"><span className="active"><b>1</b>上传 Word</span><i /><span><b>2</b>核对题目</span><i /><span><b>3</b>确认入库</span></div><section className="upload-panel"><div className="upload-settings"><div><h2>上传英语试卷</h2><p>支持 .docx，单份不超过 8 MB，最多 200 道题。</p></div><div className="field"><Label>试卷年级</Label><Picker label="导入试卷年级" value={importGrade} onChange={v => setImportGrade(v as Grade)} items={GRADES}/></div></div><input ref={fileInput} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" aria-label="上传 Word 文件" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; if (f)
        void upload(f); }}/><div className={`dropzone ${drag ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); if (!busy && e.dataTransfer.files[0])
        void upload(e.dataTransfer.files[0]); }}><div className="upload-icon">{busy === 'upload' ? <Loader2 className="animate-spin" size={30}/> : <FileText size={30}/>}</div><h3>{busy === 'upload' ? '正在读取 Word 并拆分题目…' : '把 Word 试卷拖到这里'}</h3><p>{busy === 'upload' ? '请稍候，原文件、配图和提取结果将一同保存。' : '也可以从电脑中选择文件，原始文档会保留。'}</p><Button disabled={!!busy} onClick={() => fileInput.current?.click()}><Upload />选择 Word 文件</Button></div>{fileError && <div className="error-banner" role="alert"><AlertCircle size={17}/>{fileError}</div>}<div className="import-guidance"><div><CheckCircle2 size={18}/><span>支持 1.、（1）、（　）1. 题号，以及短文中的编号填空。</span></div><div><CheckCircle2 size={18}/><span>答案区标题使用「参考答案」，每题写为 1. B。</span></div><div><AlertCircle size={18}/><span>图片、表格、自动编号及复杂阅读材料请对照原卷核对；暂不识别图片中的文字。</span></div></div><Button variant="link" className="template-link" disabled={!!busy} onClick={() => perform('template', async () => { const { downloadTemplate } = await import('@/lib/export-docx'); await downloadTemplate(); })}><Download />下载 Word 导入示例</Button></section><section className="source-section"><div className="section-title"><h2>已上传的试卷</h2><span>{state.sources.length} 份</span></div>{!state.sources.length ? <Blank title="还没有上传记录" description="上传完成后，可以从这里继续核对，或下载原始 Word。"/> : <div className="source-list">{state.sources.map(s => <div key={s.id}><div className="source-icon"><FileText /></div><div className="source-info"><strong>{s.name}</strong><p>{s.grade} · {s.count} 道题 · {new Date(s.createdAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p></div><span className={s.committed ? 'done-tag' : 'warning-tag'}>{s.committed ? '已入库' : '待核对'}</span><Button variant="outline" disabled={!!busy} onClick={() => openSource(s)}>{s.committed ? '查看题目' : '继续核对'}</Button><Button asChild variant="ghost" size="icon" aria-label={`下载 ${s.name}`}><a href={`/api/workspace/source/${s.id}/file`}><Download /></a></Button></div>)}</div>}</section></>}
 {view === 'review' && (!source ? <Blank title="先上传一份 Word 试卷" description="上传后会在这里显示原文和待核对题目。"><Button onClick={() => go('import')}>去上传</Button></Blank> : <><section className="review-summary"><div className="review-summary-row"><div className="review-file"><FileText size={18}/><strong title={source.name}>{source.name}</strong><span>{drafts.length} 道待入库</span></div>{source.report && <div className="review-metrics" role="region" aria-label="自动识别报告"><span>识别 <b>{source.report.questionCount}</b></span><span>答案 <b>{source.report.matchedAnswers}/{source.report.answerCount}</b></span><span>配图 <b>{source.report.imageCount}</b></span><span className={source.report.unmatchedAnswers.length ? 'metric-warning' : ''}>未匹配 <b>{source.report.unmatchedAnswers.length}</b></span></div>}<div className="review-actions"><Button asChild variant="outline" size="sm"><a href={`/api/workspace/source/${source.id}/file`}><Download />原始 Word</a></Button><Button variant="outline" size="sm" disabled={!!busy || draftDirty} onClick={reparseSource}><RefreshCw />重新识别</Button><Button variant="outline" size="sm" disabled={!!busy} onClick={() => perform('draft', saveDraft)}><Save />{draftDirty ? '保存核对草稿' : '草稿已保存'}</Button></div></div><details className="recognition-notes"><summary>查看识别说明（{(source.warnings?.length || 0) + (source.report ? 1 : 0)} 条）<ChevronDown size={14}/></summary><div className="notice">{source.report && <p>规则识别 v{source.report.version} · {draftDirty ? '当前草稿有手动修改；统计为上次自动识别结果。' : '统计仅表示结构匹配情况，不等于答案正确率或内容审核通过。'}</p>}{source.warnings?.map(w => <p key={w}>{w}</p>)}{source.previousDraft && <a className="backup-link" href={`/api/workspace/source/${source.id}/backup`}>下载重新识别前的草稿备份（JSON）</a>}</div></details></section><div className="review-layout"><section className="original-text"><h3>提取原文 <span>对照参考</span></h3><pre>{source.text}</pre></section><section className="review-questions"><div className="review-tools"><strong>核对题目</strong><Button variant="outline" size="sm" onClick={() => setEditor({ q: { ...blankQuestion(source.grade), source: source.name, sourceId: source.id }, context: 'draft', isNew: true })}><Plus />补录题目</Button></div>{<QuestionGroups list={drafts} renderItem={(q, i, grouped) => <QuestionCard key={q.id} q={q} index={i} grouped={grouped} review onEdit={() => setEditor({ q, context: 'draft' })} onDelete={() => removeQuestion(q, 'draft')} onMerge={i < drafts.length - 1 ? () => { setDrafts(d => { const a = d[i], b = d[i + 1]; return [...d.slice(0, i), { ...a, stem: a.stem + '\n' + b.stem, options: [...a.options, ...b.options], ...mergedImages(a, b), answer: [a.answer, b.answer].filter(Boolean).join('\n'), analysis: [a.analysis, b.analysis].filter(Boolean).join('\n'), material: a.material || b.material }, ...d.slice(i + 2)]; }); setDraftDirty(true); setAck(false); } : undefined}/>}/> }{!drafts.length && <Blank title="核对列表为空" description="可以补录题目，或返回重新上传文件。"/>}</section></div><div className="commit-bar"><label><Checkbox checked={ack} onCheckedChange={v => setAck(v === true)}/>我已核对题目、答案与分类{drafts.some(q => !q.answer) && <span>（{drafts.filter(q => !q.answer).length} 题答案留空）</span>}</label><Button className="commit-action" disabled={!ack || !drafts.length || !!busy} onClick={commit}>{busy === 'commit' ? <Loader2 className="animate-spin"/> : <Check />}确认 {drafts.length} 道题入库</Button></div></>)}
 {view === 'paper' && <>
    <div className="paper-layout"><section>
        <div className="paper-settings"><div className="field"><Label htmlFor="paper-title">试卷名称</Label><Input id="paper-title" value={paper.title} onChange={e => updatePaper({ title: e.target.value })}/></div><div className="form-row"><div className="field"><Label>年级</Label><Picker value={paper.grade} onChange={v => updatePaper({ grade: v as Grade })} label="试卷年级" items={GRADES}/></div><div className="field"><Label htmlFor="minutes">建议用时（分钟）</Label><Input id="minutes" type="number" min="1" max="300" value={paper.minutes} onChange={e => updatePaper({ minutes: Math.min(300, Math.max(1, Number(e.target.value) || 1)) })}/></div></div></div>
        <div className="list-caption"><strong>试卷题目 · {paperUnits.length} 道整题 / {paper.items.length} 小题</strong><span>{dirty ? '有未保存修改' : '修改后请保存试卷'}</span></div>
        {!paper.items.length ? <Blank title="组卷篮还是空的" description="到题库按整道大题选入，再回来调整大题顺序与小题分值。"><Button onClick={() => go('bank')}><Search/>去题库选题</Button></Blank> : paperUnits.map((unit, i) => <section className="paper-item paper-unit" key={unit.id}>
            <div className="paper-item-top"><strong>{unitHeading(unit, i)}</strong><span className="type-badge">{unit.composite ? `${unit.items.length} 小题 · ` : ''}{unit.total} 分</span><div><Button aria-label={`第${i + 1}题上移`} title="整题上移" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp/></Button><Button aria-label={`第${i + 1}题下移`} title="整题下移" variant="ghost" size="icon-sm" disabled={i === paperUnits.length - 1} onClick={() => move(i, 1)}><ArrowDown/></Button><Button aria-label={`移除第${i + 1}题`} title="移除整题" variant="ghost" size="icon-sm" onClick={() => updatePaper({ items: removePaperUnit(paper.items, unit) })}><X/></Button></div></div>
            {unit.composite && <p className="unit-numbering-note">整题一起移动或移除；小题从 1 开始编号。</p>}
            <UnitWarnings unit={unit}/>
            {(unit.material || unit.sharedImages.length > 0) && <div className="preview-material paper-unit-material"><MaterialContent text={unit.material} images={unit.sharedImages}/></div>}
            {unit.display.map((q, n) => <div className="paper-subquestion" key={q.id}>
                <p className="question-stem">{unit.composite && <strong>{n + 1}. </strong>}{isBlankPlaceholder(q.stem) ? `第 ${n + 1} 空` : q.stem}</p><QuestionImages q={q}/><QuestionOptions options={q.options}/>
                <div className="score-field"><Label htmlFor={`score-${q.id}`}>{unit.composite ? `第 ${n + 1} 小题分值` : '本题分值'}</Label><Input id={`score-${q.id}`} aria-label={`第${i + 1}题第${n + 1}小题分值`} type="number" min="0.5" max="100" step="0.5" value={unit.items[n].score} onChange={e => updatePaper({ items: paper.items.map(x => x.question.id === q.id ? { ...x, score: Math.min(100, Math.max(.5, Number(e.target.value) || .5)) } : x) })}/><span>分</span></div>
            </div>)}
        </section>)}
    </section><aside className="paper-summary"><h2>试卷概览</h2><div className="paper-total"><strong>{total}<small>分</small></strong><span>{paperUnits.length} 道整题 · {paper.items.length} 小题 · {paper.minutes} 分钟</span></div><div className="type-summary">{TYPES.map(t => { const units = paperUnits.filter(x => x.questions[0].type === t); return units.length > 0 && <div key={t}><span>{t}</span><strong>{units.length} 整题 / {units.reduce((n, u) => n + u.total, 0)} 分</strong></div>; })}</div><div className="export-actions"><Button variant="outline" disabled={!paper.items.length} onClick={() => setPreview(true)}><Eye/>预览试卷</Button><Button disabled={!!busy || !paper.items.length} onClick={() => exportPaper(false)}><Download/>导出学生试卷</Button><Button variant="outline" disabled={!!busy || !paper.items.length} onClick={() => exportPaper(true)}><Download/>导出教师答案</Button></div><p className="export-note">材料、选项和答案使用同一套内部编号。学生版不含答案；教师版按大题列出答案与解析。</p>{paper.items.some(x => !x.question.answer) && <div className="small-warning"><AlertCircle size={16}/>{paper.items.filter(x => !x.question.answer).length} 道小题尚未填写答案</div>}</aside></div>
    <section className="source-section"><div className="section-title"><h2>已保存的试卷</h2><span>{state.papers.length} 份</span></div>{!state.papers.length ? <Blank title="尚未保存试卷" description="整理完成后点击右上角「保存试卷」，下次可以继续编辑。"/> : <div className="saved-papers">{state.papers.map(p => <article key={p.id}><FileText/><h3>{p.title}</h3><p>{p.grade} · {buildPaperUnits(p.items).length} 整题 / {p.items.length} 小题 · {p.items.reduce((n, item) => n + item.score, 0)} 分</p><div><Button variant="outline" size="sm" onClick={() => openPaper(p)}><FolderOpen/>打开试卷</Button><Button variant="ghost" size="icon-sm" aria-label={`删除试卷 ${p.title}`} onClick={() => setConfirm({ title: '删除这份已保存的试卷？', description: '只删除组卷记录，题库中的题目不受影响。', action: async () => { await api('paper/' + p.id, undefined, 'DELETE'); await query.refetch(); if (paper.id === p.id) setDirty(true); } })}><Trash2/></Button></div></article>)}</div>}</section>
 </>}
 </main></SidebarInset>{editor && <Editor key={editor.q.id} question={editor.q} onClose={() => setEditor(null)} onSave={saveQuestion}/>}<AlertDialog open={!!confirm} onOpenChange={v => { if (!v && !busy)
        setConfirm(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm?.title}</AlertDialogTitle><AlertDialogDescription>{confirm?.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={!!busy}>取消</AlertDialogCancel><AlertDialogAction className={/删除|移除/.test(confirm?.title || '') ? 'destructive-confirm' : undefined} disabled={!!busy} onClick={e => { e.preventDefault(); if (confirm)
        void perform('confirm', async () => { await confirm.action(); setConfirm(null); }); }}>确认</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><Dialog open={preview} onOpenChange={setPreview}><DialogContent className="preview-dialog"><DialogHeader><DialogTitle>试卷预览</DialogTitle><DialogDescription>按当前题序和分值排版；导出的 Word 文件可继续调整。</DialogDescription></DialogHeader><label className="preview-answer-toggle"><Checkbox checked={previewAnswers} onCheckedChange={v => setPreviewAnswers(v === true)}/>显示答案与解析</label><div className="paper-preview"><h2>{paper.title}</h2><p className="preview-meta">{paper.grade} · 英语　满分 {total} 分　用时 {paper.minutes} 分钟</p><p className="student-line">班级：____________　姓名：____________</p>{paperUnits.map((unit, i) => <section className="preview-unit" key={unit.id}>
    {unit.composite && <h3 className="preview-unit-title">{unitHeading(unit, i)}（{unit.items.length} 小题，共 {unit.total} 分）</h3>}
    <UnitWarnings unit={unit}/>
    {(unit.material || unit.sharedImages.length > 0) && <div className="preview-material"><MaterialContent text={unit.material} images={unit.sharedImages}/></div>}
    {unit.display.map((q, n) => <div className="preview-question" key={q.id}>
        {isBlankPlaceholder(q.stem) && q.options.length > 0 && !q.images.length ? <div className="preview-choice-line"><strong>{unit.composite ? n + 1 : i + 1}.</strong><QuestionOptions options={q.options}/></div> : <><h3>{unit.composite ? n + 1 : i + 1}. {isBlankPlaceholder(q.stem) ? '' : q.stem}</h3><QuestionImages q={q}/><QuestionOptions options={q.options}/></>}
        {previewAnswers ? <div className="answer-block"><strong>答案：{q.answer || '待补充'}</strong><p>{q.analysis}</p></div> : !q.options.length && <div className="answer-lines">________________________________________________________________<br/><br/>________________________________________________________________</div>}
    </div>)}
</section>)}</div></DialogContent></Dialog><Toaster theme="light" position="top-center" richColors closeButton/></SidebarProvider>;
}
export default function WorkspaceApp() { const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })); return <QueryClientProvider client={client}><Workspace /></QueryClientProvider>; }
