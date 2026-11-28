// The simulation. Pure TypeScript: no DOM, no Math.random, no Date.now, and
// no Math.sin/exp/pow-style functions (their results can differ between
// browsers). Basic arithmetic and Math.floor/min/max/abs/imul are safe.
export * from './types';
export * from './sim';
export * from './commands';
export * from './lang';
export * from './tuning';
export { TRAITS } from './traits';
export { carrierText, destText, lineText, orderLineText, workerName } from './carriers';
export { CHARTER_TEXT, currentStipend } from './patron';
export { driftLine, driftPool, driftRate, langFromFloor, levelOfRow, sayingFor, speakingLang, vocabSummary } from './drift';
export { clampSettings, difficultyLabel, gameSettings, isPreset, presetKnobs, startLabel, ticksPerHour } from './settings';
export { SKILL_IDS, SKILL_LABEL, skillLevel, carryCapacity, bonusChance } from './skills';
export { standable, tileAt, siteOf } from './world';
export { findPath } from './path';
export { branchError } from './logic';
export { COMPLAINT_TEXT, bonusLift, complaintsText, topComplaints, whenText } from './morale';
export { daysPlayed, goneState, goodHoldings, goodTotal, score, type GoneState, type Holding } from './alerts';
export { goldText, headcount, recruitError, recruitFee } from './recruit';
export { clockText, darkness, dayOf, hourOf, isNight } from './time';
export { makeSave, readSave, saveSummary, SAVE_FORMAT, type SaveFile, type SaveSummary, type SaveUi } from './save';
