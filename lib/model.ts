export const GRADES = ['七年级', '八年级', '九年级'] as const;
export const TYPES = ['单项选择', '听力选择', '词汇填空', '短文填空', '完成句子', '阅读理解', '句子还原', '任务型阅读', '完形填空', '书面表达', '其他'] as const;
export const KNOWLEDGE = ['冠词', '名词', '代词', '介词', '形容词与副词', '一般现在时', '一般过去时', '现在进行时', '现在完成时', '被动语态', '情态动词', '非谓语动词', '宾语从句', '定语从句', '情景交际', '词汇运用', '阅读理解', '完形填空', '书面表达'];
export type Grade = typeof GRADES[number];
export type QType = typeof TYPES[number];
export type Question = {
    id: string;
    grade: Grade;
    type: QType;
    stem: string;
    options: string[];
    answer: string;
    analysis: string;
    knowledge: string[];
    material: string;
    source: string;
    sourceId?: string;
    originalNo: string;
    images: string[];
    imageLabels?: string[];
    status: 'review' | 'confirmed';
    warnings: string[];
    createdAt?: string;
};
export type Source = {
    id: string;
    name: string;
    grade: Grade;
    count: number;
    createdAt: string;
    text?: string;
    warnings?: string[];
    questions?: Question[];
    committed?: boolean;
    previousDraft?: string;
    report?: {
        version: string;
        questionCount: number;
        answerCount: number;
        matchedAnswers: number;
        unmatchedAnswers: string[];
        duplicateNumbers: string[];
        missingNumbers: string[];
        imageCount: number;
        reviewCount: number;
    };
};
export type PaperItem = {
    question: Question;
    score: number;
};
export type Paper = {
    id: string;
    title: string;
    grade: Grade;
    minutes: number;
    items: PaperItem[];
    updatedAt?: string;
};
export type State = {
    questions: Question[];
    sources: Source[];
    papers: Paper[];
};
export function blankQuestion(grade: Grade = '七年级'): Question { return { id: crypto.randomUUID(), grade, type: '单项选择', stem: '', options: [], answer: '', analysis: '', knowledge: [], material: '', source: '手动录入', originalNo: '', images: [], status: 'review', warnings: [] }; }
export function demoQuestions(): Question[] {
    return [
        { type: '单项选择', grade: '七年级', stem: 'My sister usually _____ to school by bus.', options: ['A. go', 'B. goes', 'C. going', 'D. went'], answer: 'B', analysis: '主语 My sister 为第三人称单数，usually 表示经常性动作，谓语用 goes。', knowledge: ['一般现在时'] },
        { type: '单项选择', grade: '八年级', stem: 'We _____ a wonderful time at the science museum last Sunday.', options: ['A. have', 'B. are having', 'C. had', 'D. will have'], answer: 'C', analysis: 'last Sunday 表示过去时间，使用一般过去时，have 的过去式是 had。', knowledge: ['一般过去时'] },
        { type: '词汇填空', grade: '九年级', stem: 'English is _____ (speak) in many countries around the world.', options: [], answer: 'spoken', analysis: '主语 English 与 speak 之间是被动关系，使用 be + 过去分词。', knowledge: ['被动语态'] },
    ].map((q, i) => ({ ...blankQuestion(), ...q, id: `demo-${i + 1}`, source: '系统示例 · 非真实试卷', originalNo: String(i + 1), status: 'confirmed' } as Question));
}
