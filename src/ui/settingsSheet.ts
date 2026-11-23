import { PUPPET_KINDS, STORY_FONTS, TEXT_SIZES, type GameSettings } from '../save/saveStore';
import { deviceHasFont } from './storyLook';
import { el, screenButton, showSheet } from './dom';
import { TEXT } from './text';

/**
 * 設定の欄（序章に足りない仕組み）: 音量（10 ずつ）・消音・見た手ほどきを出さないか・確認用の機能。下からせり上がる欄に出す。
 * 見た目の見本の2回目で、書体・文字の大きさ（いつでも）を足した。KayKit の人形の試しで、人形（確認用の機能が入の時だけ）を足した（ドット風の描き方は外した）。
 * 変えるたびに onChange を呼ぶ（保存と、音の仕組みへの反映は呼ぶ側）
 */
export function showSettingsSheet(root: HTMLElement, current: () => GameSettings, onChange: (next: GameSettings) => void, onClose?: () => void): void {
  const body = el('div', 'settings-body');
  const ref: { sheet?: HTMLElement } = {};
  const close = () => {
    const backdrop = ref.sheet?.previousElementSibling;
    if (backdrop?.classList.contains('sheet-backdrop')) backdrop.remove();
    ref.sheet?.remove();
    onClose?.();
  };
  const render = () => {
    const s = current();
    body.innerHTML = '';
    const volumeRow = el('div', 'settings-row settings-volume');
    const set = (patch: Partial<GameSettings>) => {
      onChange({ ...current(), ...patch });
      render();
    };
    volumeRow.append(
      screenButton(TEXT.settings.volumeDown, () => set({ volume: Math.max(0, s.volume - 10) }), { className: 'settings-step volume-down', disabled: s.volume <= 0 }),
      el('span', 'settings-value', TEXT.settings.volume(s.volume)),
      screenButton(TEXT.settings.volumeUp, () => set({ volume: Math.min(100, s.volume + 10) }), { className: 'settings-step volume-up', disabled: s.volume >= 100 }),
    );
    // 切り替えと、その説明を1つのまとまりにする（横向きの低い画面では、まとまりを横に並べる）
    const item = (...nodes: HTMLElement[]) => {
      const box = el('div', 'settings-item');
      box.append(...nodes);
      return box;
    };
    const mute = item(
      screenButton(s.muted ? TEXT.settings.unmute : TEXT.settings.mute, () => set({ muted: !s.muted }), {
        className: 'settings-mute',
        pressed: s.muted,
      }),
    );
    if (s.muted) mute.append(el('p', 'screen-note', TEXT.settings.mutedNote));
    /** 選び肢のボタンの列（押されているものが今の値）。読み上げの名前は「文字の大きさ: 中」のように、どの列かを添える */
    const choices = <T extends string>(
      group: string,
      list: readonly T[],
      labels: Readonly<Record<T, string>>,
      value: T,
      pick: (v: T) => void,
      key: string,
      notes: Readonly<Partial<Record<string, string>>> = {},
    ) => {
      const row = el('div', `settings-row settings-choices settings-${key}`);
      row.append(el('span', 'settings-label', group));
      const buttons = el('div', 'settings-choice-buttons');
      for (const v of list) {
        const b = screenButton(labels[v], () => pick(v), { className: 'settings-choice', pressed: v === value });
        b.setAttribute('aria-label', TEXT.settings.choiceLabel(group, labels[v]));
        b.dataset.value = v;
        buttons.append(b);
      }
      row.append(buttons);
      // 選び肢に添える短い説明は、ボタンの列の下に、欄の幅いっぱいに出す（狭い名前の列に詰め込まない）
      const noteLines = list.flatMap((v) => (notes[v] ? [el('span', 'settings-label-note', TEXT.settings.choiceNote(labels[v], notes[v]))] : []));
      if (noteLines.length > 0) {
        const box = el('div', 'settings-notes');
        box.append(...noteLines);
        row.append(box);
      }
      return row;
    };
    const look = el('div', 'settings-look');
    look.append(
      // ヒラギノ明朝・丸ゴ（同梱しない端末の書体）には、この端末にあるかを添える（文字の幅を測って調べる）
      choices(TEXT.settings.font, STORY_FONTS, TEXT.settings.fonts, s.storyFont, (v) => set({ storyFont: v }), 'font', {
        hiraginoMincho: deviceHasFont('hiraginoMincho') ? TEXT.settings.fontOnDevice : TEXT.settings.fontNotOnDevice.hiraginoMincho,
        hiraginoMaru: deviceHasFont('hiraginoMaru') ? TEXT.settings.fontOnDevice : TEXT.settings.fontNotOnDevice.hiraginoMaru,
      }),
      choices(TEXT.settings.textSize, TEXT_SIZES, TEXT.settings.textSizes, s.textSize, (v) => set({ textSize: v }), 'text-size'),
    );
    body.append(
      look,
      volumeRow,
      mute,
      item(
        screenButton(s.skipSeenTutorials ? TEXT.settings.tutorialOn : TEXT.settings.tutorialOff, () => set({ skipSeenTutorials: !s.skipSeenTutorials }), {
          className: 'settings-tutorial',
          pressed: s.skipSeenTutorials,
        }),
        el('p', 'screen-note', TEXT.settings.tutorialNote),
      ),
      item(
        screenButton(s.checkTools ? TEXT.settings.checkOn : TEXT.settings.checkOff, () => set({ checkTools: !s.checkTools }), {
          className: 'settings-check',
          pressed: s.checkTools,
        }),
        el('p', 'screen-note', TEXT.settings.checkNote),
      ),
    );
    // 人形（確認用の機能）。切り替えのボタンの後に置き、低い画面では切り替えと組にして並べる（style.css。書体の列が2段になった分の高さを空ける）
    if (s.checkTools) body.append(choices(TEXT.settings.puppetKind, PUPPET_KINDS, TEXT.settings.puppetKinds, s.puppetKind, (v) => set({ puppetKind: v }), 'puppet'));
  };
  render();
  ref.sheet = showSheet(root, { kind: 'settings', title: TEXT.settings.title, body: [body], closeLabel: TEXT.settings.close, onClose: close });
}

/**
 * 旋律が鳴っている間の印（♪）。音が出ていなくても（消音・音を出せない端末でも）、何が鳴っているかが分かるように出す
 */
export function createSoundMark(root: HTMLElement): { show(text: string | null): void; flash(text: string): void } {
  const mark = el('div', 'sound-mark');
  mark.setAttribute('role', 'status');
  mark.hidden = true;
  root.append(mark);
  let melodyText: string | null = null;
  let flashTimer: number | undefined;
  return {
    show(text) {
      melodyText = text;
      if (flashTimer !== undefined) return;
      mark.hidden = text === null;
      if (text !== null) mark.textContent = text;
    },
    flash(text) {
      if (flashTimer !== undefined) window.clearTimeout(flashTimer);
      mark.hidden = false;
      mark.textContent = text;
      flashTimer = window.setTimeout(() => {
        flashTimer = undefined;
        mark.hidden = melodyText === null;
        if (melodyText !== null) mark.textContent = melodyText;
      }, 1600);
    },
  };
}
