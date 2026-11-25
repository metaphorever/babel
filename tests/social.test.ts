import { describe, expect, it } from 'vitest';
import { addWorker, createState } from '../src/sim/sim';
import { applyCommand } from '../src/sim/commands';
import { beatenTo, childrenOf, farewell, feelingWatch, feelOf, gossip, lessonWord, pairLabel, parentsOf, partnersOf, related, relationsOf, socialArrival, together, tookNotice, updateSocial, wokeBeside } from '../src/sim/social';
import { ECONOMY, REMIT, SOCIAL, TIME } from '../src/sim/tuning';
import { updatePatron } from '../src/sim/patron';
import { barMood, runActivity } from '../src/sim/activities';
import type { SimState, Worker } from '../src/sim/types';

/** Run the social web's dawn check once, a day after the last. */
function nextDawn(s: SimState) {
  s.tick = s.social.nextDawn;
  updateSocial(s);
}

const set = (a: Worker, b: Worker, ab: number, ba = ab) => {
  a.feel[b.id] = a.feelBase[b.id] = ab;
  b.feel[a.id] = b.feelBase[a.id] = ba;
};

describe('relationships', () => {
  it('labels go by the weaker side, except frenemies, the mixed pair', () => {
    expect(pairLabel(0.9, 0.6)).toBe('friends');
    expect(pairLabel(0.9, 0.86)).toBe('best friends');
    expect(pairLabel(0.75, 0.72)).toBe('good friends');
    expect(pairLabel(0.05, 0.08)).toBe('enemies');
    expect(pairLabel(0.05, 0.2)).toBe(''); // one hates, one only dislikes: no mutual hate
    expect(pairLabel(0.6, 0.2)).toBe('frenemies');
    expect(pairLabel(0.4, 0.45)).toBe('');
  });

  it('families and couples follow the rules, over many colonies', () => {
    let couples = 0;
    let children = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const s = createState(seed, 'normal', 'opening');
      while (s.workers.length < 16) socialArrival(s, addWorker(s));
      for (let d = 0; d < 10; d++) nextDawn(s);
      for (const t of s.social.ties) {
        if (t.kind === 'parent') continue;
        couples++;
        // no couple is family, by birth or by marriage
        expect(related(s, t.a, t.b)).toBe(false);
      }
      for (const w of s.workers) {
        expect(parentsOf(s, w.id, true).length).toBeLessThanOrEqual(2);
        children += parentsOf(s, w.id).length > 0 ? 1 : 0;
        // nobody is their own ancestor
        const seen = new Set<number>();
        const climb = (id: number) => {
          for (const p of parentsOf(s, id)) {
            expect(p).not.toBe(w.id);
            if (!seen.has(p)) {
              seen.add(p);
              climb(p);
            }
          }
        };
        climb(w.id);
      }
      // a spouse's children are theirs too (unless that would make a couple family)
      for (const t of s.social.ties) {
        if (t.kind !== 'spouse') continue;
        for (const c of childrenOf(s, t.a)) if (c !== t.b && !related(s, t.b, c)) expect(childrenOf(s, t.b)).toContain(c);
      }
    }
    // the web isn't empty
    expect(couples).toBeGreaterThan(40);
    expect(children).toBeGreaterThan(40);
  });

  it('the social web has its own dice: it never shifts the sim’s rolls', () => {
    const s = createState(7);
    const rng = [...s.rng];
    for (let d = 0; d < 5; d++) nextDawn(s);
    expect(s.rng).toEqual(rng);
  });

  it('a couple who fall out get a day’s grace, then divorce', () => {
    const s = createState(7);
    const [a, b] = s.workers;
    s.social.ties = [{ kind: 'spouse', a: a.id, b: b.id, strained: null }];
    set(a, b, 0.6);
    nextDawn(s);
    expect(partnersOf(s, a.id)).toEqual([b.id]);
    set(a, b, 0.05, 0.6); // one side has soured
    nextDawn(s);
    expect(partnersOf(s, a.id)).toEqual([b.id]); // the grace day
    expect(s.events.some((e) => e.text.includes('Things are bad between'))).toBe(true);
    nextDawn(s);
    expect(partnersOf(s, a.id)).toEqual([]);
    expect(s.events.some((e) => e.text === `${a.name} and ${b.name} have divorced.`)).toBe(true);
  });

  it('recovering inside the grace day saves the marriage', () => {
    const s = createState(7);
    const [a, b] = s.workers;
    s.social.ties = [{ kind: 'spouse', a: a.id, b: b.id, strained: null }];
    set(a, b, 0.05, 0.6);
    nextDawn(s);
    set(a, b, 0.5, 0.6);
    nextDawn(s);
    nextDawn(s);
    expect(partnersOf(s, a.id)).toEqual([b.id]);
  });

  it('a monogamous spouse finds out about a secret lover, and it costs', () => {
    const s = createState(7);
    const [a, b, c] = s.workers;
    s.social.ties = [
      { kind: 'spouse', a: a.id, b: b.id, strained: null },
      { kind: 'lover', a: a.id, b: c.id, secret: true, strained: null },
    ];
    b.monogamy = 1;
    set(a, b, 0.8);
    set(a, c, 0.8);
    set(b, c, 0.5);
    let days = 0;
    while (s.social.ties[1].secret && days++ < 200) {
      nextDawn(s);
      set(a, c, 0.8); // keep the affair warm
    }
    expect(s.social.ties[1].secret).toBe(false);
    expect(feelOf(b, a)).toBeCloseTo(0.8 - SOCIAL.dawn.betrayed, 5);
    expect(feelOf(b, c)).toBeCloseTo(0.5 - SOCIAL.dawn.rival, 5);
    expect(s.events.some((e) => e.text === `${b.name} found out that ${a.name} has been seeing ${c.name}.`)).toBe(true);
  });

  it('label changes are logged at dawn; rolled ones are not', () => {
    const s = createState(7);
    expect(s.events.some((e) => /friends|enemies|lovers|married/.test(e.text))).toBe(false);
    const [a, b] = s.workers;
    set(a, b, 0.9);
    nextDawn(s);
    expect(s.events.some((e) => e.text === `${a.name} and ${b.name} have become best friends.`)).toBe(true);
  });

  it('drinking together warms you to the people beside you', () => {
    const s = createState(7);
    const [a, b, c] = s.workers;
    set(a, b, 0.4);
    set(a, c, 0.4);
    b.activity = { ...b.activity, kind: 'bar', stage: 1 };
    b.x = a.x + 1;
    b.y = a.y;
    c.activity = { ...c.activity, kind: 'bar', stage: 1 };
    c.x = a.x + 20;
    c.y = a.y;
    together(s, a, 'bar', SOCIAL.event.drankTogether);
    expect(feelOf(a, b)).toBeCloseTo(0.4 + SOCIAL.event.drankTogether, 6);
    expect(feelOf(a, c)).toBe(0.4); // too far away
  });

  it('the worker window lists a spouse once, family, then friends and feelings', () => {
    const s = createState(7);
    const [a, b, c, d] = s.workers;
    for (const w of s.workers) for (const o of s.workers) if (w !== o) w.feel[o.id] = 0.4;
    s.social.ties = [
      { kind: 'spouse', a: a.id, b: b.id, strained: null },
      { kind: 'lover', a: a.id, b: b.id, strained: null },
      { kind: 'parent', a: a.id, b: c.id, bio: true },
    ];
    set(a, d, 0.9, 0.2);
    expect(relationsOf(s, a).map((r) => r.text)).toEqual([`Married to ${b.name}`, `Parent of ${c.name}`, `Frenemies with ${d.name}`]);
    set(a, d, 0.9, 0.4);
    expect(relationsOf(s, a).map((r) => r.text)).toContain(`Adores ${d.name}`);
    expect(s.tick).toBeLessThan(TIME.dayTicks);
  });
});

describe('social life', () => {
  /** Run with a tuning number swapped, then put it back. */
  function withTuning<T extends object, K extends keyof T>(obj: T, key: K, value: T[K], run: () => void) {
    const was = obj[key];
    obj[key] = value;
    try {
      run();
    } finally {
      obj[key] = was;
    }
  }
  const atBar = (w: Worker, x: number, y: number) => {
    w.activity = { ...w.activity, kind: 'bar', stage: 1 };
    w.x = x;
    w.y = y;
  };

  it('a complaint makes the listener take a side: whoever they like better', () => {
    const s = createState(7);
    const [speaker, subject, listener] = s.workers;
    speaker.lately = [{ about: subject.id, tone: -1, what: `${subject.name} snoring all night`, tick: s.tick }];
    // the listener likes the subject more: they think less of the speaker
    set(listener, subject, 0.7);
    set(listener, speaker, 0.45);
    gossip(s, speaker, listener);
    expect(feelOf(listener, speaker)).toBeCloseTo(0.45 - SOCIAL.gossip.side, 6);
    expect(listener.lately[0].what).toBe(`${speaker.name} badmouthing ${subject.name}`);
    // now they like the speaker more: they sour on the subject, and warm to the speaker
    set(listener, subject, 0.4);
    set(listener, speaker, 0.6);
    listener.lately = [];
    gossip(s, speaker, listener);
    expect(feelOf(listener, subject)).toBeCloseTo(0.4 - SOCIAL.gossip.pile, 6);
    expect(feelOf(listener, speaker)).toBeCloseTo(0.6 + SOCIAL.gossip.bond, 6);
    expect(listener.lately[0]).toMatchObject({ about: subject.id, heardFrom: speaker.id, tone: -1 });
    // what they only heard, they don't pass on
    const next = s.workers[3];
    const before = feelOf(next, subject);
    gossip(s, listener, next);
    expect(feelOf(next, subject)).toBe(before);
  });

  it('nobody gossips to someone about themselves', () => {
    const s = createState(7);
    const [speaker, subject] = s.workers;
    speaker.lately = [{ about: subject.id, tone: -1, what: 'x', tick: s.tick }];
    const before = feelOf(subject, speaker);
    gossip(s, speaker, subject);
    expect(feelOf(subject, speaker)).toBe(before);
  });

  it('a snorer beside you all night: your taste decides', () => {
    const s = createState(7);
    const [w, o] = s.workers;
    o.habits = ['snores'];
    o.activity = { ...o.activity, kind: 'sleep', stage: 1 };
    o.x = w.x + 1;
    o.y = w.y;
    set(w, o, 0.5);
    w.tastes.snores = -1;
    wokeBeside(s, w);
    expect(feelOf(w, o)).toBeCloseTo(0.5 - SOCIAL.habits.dose, 6);
    expect(w.lately[0].what).toBe(`${o.name} snoring all night`);
  });

  it('enemies drinking side by side may come to blows; a friend breaks it up', () => {
    const s = createState(7);
    const [a, b, c] = s.workers;
    for (const w of [a, b, c]) for (const o of s.workers) if (w !== o) w.feel[o.id] = 0.4;
    set(a, b, 0.05);
    set(c, a, 0.6, 0.4);
    atBar(a, 50, 20);
    atBar(b, 51, 20);
    atBar(c, 52, 20);
    withTuning(SOCIAL.scuffle, 'chance', 1, () => withTuning(SOCIAL.gossip, 'chance', 0, () => together(s, a, 'bar', 0)));
    expect(s.events.some((e) => e.text === `${a.name} and ${b.name} came to blows at the bar; ${c.name} broke it up.`)).toBe(true);
    expect(a.moodlets.some((m) => m.kind === 'scuffle')).toBe(true);
    expect(feelOf(a, c)).toBeCloseTo(0.4 + SOCIAL.scuffle.thanks, 6);
  });

  it('beaten to a job: you know whom to blame', () => {
    const s = createState(7);
    const [w, o] = s.workers;
    set(w, o, 0.5);
    tookNotice(s, o, 999);
    beatenTo(s, w, 999);
    expect(feelOf(w, o)).toBeCloseTo(0.5 - SOCIAL.job.beatMe, 6);
    expect(w.lately[0].what).toBe(`${o.name} beating them to a job`);
  });

  it('lessons warm teacher and student to each other', () => {
    const s = createState(7);
    const [t, st] = s.workers;
    set(t, st, 0.4);
    lessonWord(s, t, st);
    expect(feelOf(t, st)).toBeCloseTo(0.4 + SOCIAL.lessonWord, 6);
    expect(feelOf(st, t)).toBeCloseTo(0.4 + SOCIAL.lessonWord, 6);
  });

  it('when someone quits, a spouse may go too; friends are sad, enemies glad', () => {
    const s = createState(7);
    const [w, spouse, friend, foe] = s.workers;
    s.social.ties = [{ kind: 'spouse', a: w.id, b: spouse.id, strained: null }];
    set(spouse, w, 0.8);
    set(friend, w, 0.75);
    set(foe, w, 0.05);
    w.leaving = true;
    let following: Worker[] = [];
    withTuning(SOCIAL.leaving, 'follow', 10, () => (following = farewell(s, w)));
    expect(following).toEqual([spouse]);
    expect(friend.moodlets.find((m) => m.kind === 'farewell')?.value).toBe(SOCIAL.leaving.missed);
    expect(foe.moodlets.find((m) => m.kind === 'farewell')?.value).toBe(SOCIAL.leaving.glad);
  });

  it('shared time is capped per pair per day; the next dawn it counts afresh', () => {
    const s = createState(7);
    const [a, b] = s.workers;
    set(a, b, 0.4);
    atBar(b, a.x + 1, a.y);
    withTuning(SOCIAL.gossip, 'chance', 0, () => {
      for (let i = 0; i < 20; i++) together(s, a, 'bar', SOCIAL.event.drankTogether);
    });
    expect(feelOf(a, b)).toBeCloseTo(0.4 + SOCIAL.event.dailyCap, 6);
    nextDawn(s);
    expect(s.social.today).toEqual({});
  });

  it('feelings drift back toward how they first felt, a share each dawn', () => {
    const s = createState(7);
    const [a, b] = s.workers;
    a.feelBase[b.id] = 0.4;
    a.feel[b.id] = 0.8;
    nextDawn(s);
    expect(feelOf(a, b)).toBeCloseTo(0.8 - 0.4 * SOCIAL.drift, 6);
  });
});

describe('purses and the bar', () => {
  it('a full purse goes home at dawn: frugal workers send sooner and more', () => {
    const s = createState(7);
    const [a, b, c] = s.workers;
    a.traits = [];
    b.traits = ['frugal'];
    c.traits = [];
    for (const w of s.workers) w.purse = 0;
    a.purse = 50;
    b.purse = 30;
    c.purse = 20; // not full yet
    s.tick = s.nextStipend;
    updatePatron(s);
    expect(a.purse).toBe(50 - Math.floor(50 * REMIT.share.usual));
    expect(b.purse).toBe(30 - Math.floor(30 * REMIT.share.frugal));
    expect(c.purse).toBe(20);
    expect(s.sentHome).toBe(Math.floor(50 * REMIT.share.usual) + Math.floor(30 * REMIT.share.frugal));
    expect(a.moodlets.some((m) => m.kind === 'remit')).toBe(true);
  });

  it('a bar’s beer price can be set; cheap beer cheers more', () => {
    const s = createState(7);
    const bar = s.sites.find((x) => x.kind === 'bar')!;
    expect(applyCommand(s, { type: 'setBeerPrice', playerId: 0, siteId: bar.id, price: 2 }).ok).toBe(true);
    expect(bar.price).toBe(2);
    expect(applyCommand(s, { type: 'setBeerPrice', playerId: 0, siteId: bar.id, price: -1 }).ok).toBe(false);
    expect(applyCommand(s, { type: 'setBeerPrice', playerId: 0, siteId: bar.id, price: ECONOMY.beerPriceMax + 1 }).ok).toBe(false);
    expect(barMood(2)).toBeGreaterThan(barMood(ECONOMY.beerPrice));
    expect(barMood(ECONOMY.beerPriceMax)).toBe(ECONOMY.barMoodMin);
    // a worker with 3 gold can now afford a beer, and pays the bar's price
    const w = s.workers[1];
    w.purse = 3;
    w.activity = { kind: 'bar', stage: 0, timer: 0, target: null, read: null, ref: null, aim: null };
    const gold = s.gold;
    for (let i = 0; i < 4000 && w.activity.stage === 0; i++) runActivity(s, w);
    expect(w.activity.kind).toBe('bar');
    expect(w.activity.stage).toBe(1);
    expect(w.purse).toBe(1);
    expect(s.gold - gold).toBeGreaterThanOrEqual(2);
  });

  it('the tuning tools can watch what moves feelings, and why', () => {
    const s = createState(7);
    const [t, st] = s.workers;
    set(t, st, 0.4);
    const seen: string[] = [];
    feelingWatch.moved = (from, to, why) => seen.push(`${from}>${to}:${why}`);
    try {
      lessonWord(s, t, st);
    } finally {
      feelingWatch.moved = null;
    }
    expect(seen).toEqual([`${t.id}>${st.id}:lessons`, `${st.id}>${t.id}:lessons`]);
  });

  it('the last straw: a rumor of badmouthing finds its way back, and ends a friendship', () => {
    const s = createState(7);
    const [rejun, enbet, haftra] = s.workers;
    for (const w of [rejun, enbet, haftra]) for (const o of s.workers) if (w !== o) set(w, o, 0.4);
    // Rejun and Enbet are friends; Rejun snored, and Enbet minded
    set(rejun, enbet, 0.65);
    enbet.lately = [{ about: rejun.id, tone: -1, what: `${rejun.name} snoring all night`, tick: s.tick }];
    // Enbet complains to Haftra, who likes Rejun better and takes their side
    set(haftra, rejun, 0.7);
    set(haftra, enbet, 0.45, 0.4);
    gossip(s, enbet, haftra);
    expect(haftra.lately[0]).toMatchObject({ about: enbet.id, target: rejun.id });
    // later, Haftra sits beside Rejun and tells them, even with other news to share
    haftra.lately.push({ about: enbet.id, tone: 1, what: 'something else', tick: s.tick });
    gossip(s, haftra, rejun);
    expect(feelOf(rejun, enbet)).toBeCloseTo(0.65 - SOCIAL.gossip.lastStraw, 6);
    expect(rejun.feelBase[enbet.id]).toBeCloseTo(0.65 - SOCIAL.gossip.lastStrawBase, 6);
    expect(feelOf(rejun, haftra)).toBeCloseTo(0.7 + SOCIAL.gossip.toldMe, 6);
    expect(s.events.some((e) => e.text === `${rejun.name} heard from ${haftra.name} that ${enbet.name} has been badmouthing them, and they were friends.`)).toBe(true);
    // told once: Haftra has nothing more to pass on about it
    expect(haftra.lately.some((m) => m.target === rejun.id)).toBe(false);
  });
});
