import { DRIFT, DRIFTABLE, LANGS, floorName, levelName, driftPool, wordIn, type Sim, type SimState } from '../sim';
import { clear, h } from './dom';
import type { WindowManager } from './windows';

/**
 * Your lexicon (the words you can write, per language), who speaks what,
 * and when each language starts drifting into the tower.
 */
export class LanguagesPanel {
  private body: HTMLElement;

  constructor(
    wm: WindowManager,
    private sim: Sim,
  ) {
    const win = wm.create('languages', 'Languages', 390, 34, 380);
    this.body = h('div');
    win.body.append(this.body);
  }

  private get s(): SimState {
    return this.sim.state;
  }

  refresh(): void {
    const s = this.s;
    clear(this.body);
    const open = driftPool(s);
    this.body.append(
      h(
        'p',
        { class: 'hint' },
        `Workers who spend time on ${levelName(DRIFT.lineFloor)} or higher slowly lose words to another language, one word at a time. Names never drift. To bring someone back, get them down to the ground and have a translator TEACH them. To write in their language instead, have a translator LEARN from them.`,
      ),
    );
    for (const l of LANGS) {
      const lex = s.lexicon[l.id] ?? [];
      const speakers = s.workers.filter((w) => (w.vocab[l.id]?.length ?? 0) > 0);
      const status =
        l.id === 'en'
          ? 'The common tongue'
          : open.includes(l.id)
            ? 'Drifting in now'
            : `Drifts in once the tower reaches ${floorName(l.fromFloor, true)}`;
      this.body.append(
        h('div', { class: 'section-label' }, `${l.name} · ${status}`),
        h('div', { class: 'kv' }, h('span', { class: 'k' }, 'You can write'), h('span', { class: 'v' }, `${lex.length} of ${DRIFTABLE.length} words`)),
      );
      if (l.id !== 'en') {
        const words = h('div', { class: 'lex-words' });
        for (const t of DRIFTABLE) {
          const known = lex.includes(t);
          words.append(h('span', { class: `lex-word${known ? '' : ' missing'}`, lang: l.id, title: known ? `means “${wordIn(t, 'en')}”` : 'not learned yet' }, known ? wordIn(t, l.id) : '·'));
        }
        this.body.append(words);
      }
      this.body.append(
        h(
          'div',
          { class: 'kv' },
          h('span', { class: 'k' }, 'Speakers'),
          h('span', { class: 'v' }, speakers.length ? speakers.map((w) => `${w.name} (${w.vocab[l.id]!.length})`).join(', ') : 'nobody'),
        ),
      );
    }
  }
}
