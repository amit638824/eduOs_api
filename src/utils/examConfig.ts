import { asJsonObject } from './json.js';

export interface ExamSecurityConfig {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarking: boolean;
  fullScreen: boolean;
  browserLock: boolean;
  blockCopyPaste: boolean;
  autoSubmit: boolean;
  allowResume: boolean;
  maxTabSwitches: number;
  /** When false, students cannot see correct answers / option keys until staff enables. */
  releaseAnswers: boolean;
}

export const DEFAULT_EXAM_CONFIG: ExamSecurityConfig = {
  shuffleQuestions: false,
  shuffleOptions: false,
  negativeMarking: false,
  fullScreen: true,
  browserLock: true,
  blockCopyPaste: true,
  autoSubmit: true,
  allowResume: true,
  maxTabSwitches: 5,
  releaseAnswers: false,
};

export function parseExamConfig(raw: unknown): ExamSecurityConfig {
  const cfg = asJsonObject(raw) ?? {};
  return {
    shuffleQuestions: Boolean(cfg.shuffleQuestions ?? DEFAULT_EXAM_CONFIG.shuffleQuestions),
    shuffleOptions: Boolean(cfg.shuffleOptions ?? DEFAULT_EXAM_CONFIG.shuffleOptions),
    negativeMarking: Boolean(cfg.negativeMarking ?? DEFAULT_EXAM_CONFIG.negativeMarking),
    fullScreen: Boolean(cfg.fullScreen ?? DEFAULT_EXAM_CONFIG.fullScreen),
    browserLock: Boolean(cfg.browserLock ?? DEFAULT_EXAM_CONFIG.browserLock),
    blockCopyPaste: Boolean(cfg.blockCopyPaste ?? DEFAULT_EXAM_CONFIG.blockCopyPaste),
    autoSubmit: Boolean(cfg.autoSubmit ?? DEFAULT_EXAM_CONFIG.autoSubmit),
    allowResume: Boolean(cfg.allowResume ?? DEFAULT_EXAM_CONFIG.allowResume),
    maxTabSwitches: Number(cfg.maxTabSwitches ?? DEFAULT_EXAM_CONFIG.maxTabSwitches),
    releaseAnswers: Boolean(cfg.releaseAnswers ?? DEFAULT_EXAM_CONFIG.releaseAnswers),
  };
}

export function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function seededShuffle<T>(items: T[], seedStr: string): T[] {
  const arr = [...items];
  let seed = hashSeed(seedStr);
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
