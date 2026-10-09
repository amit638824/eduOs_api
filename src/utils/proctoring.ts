import { asJsonArray } from './json.js';
import type { ExamSecurityConfig } from './examConfig.js';

export interface ProctoringEvent {
  event: string;
  detail?: Record<string, unknown>;
  at: string;
}

export interface ProctoringSummary {
  tab_switches: number;
  fullscreen_exits: number;
  copy_paste_attempts: number;
  window_blurs: number;
  total_events: number;
  flagged: boolean;
  flag_reasons: string[];
}

export function normalizeProctoringLog(raw: unknown): ProctoringEvent[] {
  const arr = asJsonArray(raw);
  return arr
    .map((item) => {
      const o = item as Record<string, unknown>;
      return {
        event: String(o.event ?? ''),
        detail: (o.detail as Record<string, unknown>) ?? {},
        at: String(o.at ?? ''),
      };
    })
    .filter((e) => e.event);
}

export function summarizeProctoring(
  log: ProctoringEvent[],
  config: ExamSecurityConfig,
): ProctoringSummary {
  let tab_switches = 0;
  let fullscreen_exits = 0;
  let copy_paste_attempts = 0;
  let window_blurs = 0;

  for (const e of log) {
    switch (e.event) {
      case 'tab_switch':
        tab_switches += 1;
        break;
      case 'fullscreen_exit':
        fullscreen_exits += 1;
        break;
      case 'copy_attempt':
      case 'paste_attempt':
      case 'cut_attempt':
        copy_paste_attempts += 1;
        break;
      case 'window_blur':
        window_blurs += 1;
        break;
      default:
        break;
    }
  }

  const flag_reasons: string[] = [];
  if (tab_switches > config.maxTabSwitches) {
    flag_reasons.push(`Tab switches (${tab_switches}) exceeded limit (${config.maxTabSwitches})`);
  }
  if (fullscreen_exits > config.maxFullscreenExits) {
    flag_reasons.push(
      `Fullscreen exits (${fullscreen_exits}) exceeded limit (${config.maxFullscreenExits})`,
    );
  }
  if (copy_paste_attempts > config.maxCopyPasteAttempts) {
    flag_reasons.push(
      `Copy/paste attempts (${copy_paste_attempts}) exceeded limit (${config.maxCopyPasteAttempts})`,
    );
  }

  return {
    tab_switches,
    fullscreen_exits,
    copy_paste_attempts,
    window_blurs,
    total_events: log.length,
    flagged: flag_reasons.length > 0,
    flag_reasons,
  };
}
