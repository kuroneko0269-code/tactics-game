import { hillBattle } from './hill';
import { weirBattle } from './weir';

/** 序章の戦闘（序章の PR B） */
export const prologueBattles = [weirBattle, hillBattle] as const;
export { hillBattle, weirBattle };
