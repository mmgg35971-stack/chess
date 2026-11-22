// Glicko-2 (Mark Glickman, "Example of the Glicko-2 system", 2012), one puzzle = one rating period,
// the way Lichess rates puzzles: the puzzle is the "opponent", solving it = win, failing = loss.
// Constants follow Lichess' puzzle settings where they are public: default volatility 0.09,
// tau 0.75, deviation kept within [45, 350]. The starting rating is 1000 (project spec 7.4).

export interface Glicko { rating: number; rd: number; vol: number }

export const SCALE = 173.7178;
export const DEFAULT_PLAYER: Glicko = { rating: 1000, rd: 350, vol: 0.09 };
export const TAU = 0.75;
export const MIN_RD = 45;
export const MAX_RD = 350;
/** Lichess shows a "?" while the deviation is above this (provisional rating). */
export const PROVISIONAL_RD = 110;

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu: number, muj: number, phij: number) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

/** Expected score (probability of solving) of a player against a puzzle. */
export function expectedScore(p: Glicko, opp: { rating: number; rd: number }): number {
  return E((p.rating - 1500) / SCALE, (opp.rating - 1500) / SCALE, opp.rd / SCALE);
}

/** One rating period with a single result `score` (1 = solved, 0 = failed). */
export function update(p: Glicko, opp: { rating: number; rd: number }, score: 0 | 1): Glicko {
  return updatePeriod(p, [{ ...opp, score }]);
}

/** Full Glicko-2 rating-period update (several results), as in the paper. */
export function updatePeriod(p: Glicko, results: { rating: number; rd: number; score: number }[], tau = TAU, clamp = true): Glicko {
  const mu = (p.rating - 1500) / SCALE;
  const phi = p.rd / SCALE;
  let vInv = 0, dSum = 0;
  for (const r of results) {
    const muj = (r.rating - 1500) / SCALE, phij = r.rd / SCALE;
    const gj = g(phij), e = E(mu, muj, phij);
    vInv += gj * gj * e * (1 - e);
    dSum += gj * (r.score - e);
  }
  const v = 1 / vInv;
  const delta = v * dSum;

  // volatility: Illinois algorithm (step 5 of the paper)
  const a = Math.log(p.vol * p.vol);
  const f = (x: number) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const vol = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * dSum;
  const rd = phiNew * SCALE;
  return { rating: muNew * SCALE + 1500, rd: clamp ? Math.min(MAX_RD, Math.max(MIN_RD, rd)) : rd, vol };
}

/** Rating deviation grows while the player is inactive (one empty rating period per idle day). */
export function decay(p: Glicko, idleDays: number): Glicko {
  if (idleDays <= 0) return p;
  const phi = p.rd / SCALE;
  const phiNew = Math.sqrt(phi * phi + idleDays * p.vol * p.vol);
  return { ...p, rd: Math.min(MAX_RD, Math.max(MIN_RD, phiNew * SCALE)) };
}

/** Rating bands from the project spec (7.4), with one band below 1000 for beginners. */
export const BANDS: { min: number; max: number; key: string }[] = [
  { min: 0, max: 1000, key: 'band_lt1000' },
  { min: 1000, max: 1200, key: 'band_1000' },
  { min: 1200, max: 1400, key: 'band_1200' },
  { min: 1400, max: 1600, key: 'band_1400' },
  { min: 1600, max: 1800, key: 'band_1600' },
  { min: 1800, max: 2000, key: 'band_1800' },
  { min: 2000, max: 2200, key: 'band_2000' },
  { min: 2200, max: 2400, key: 'band_2200' },
  { min: 2400, max: 99999, key: 'band_2400' },
];
export const bandOf = (r: number) => BANDS.find((b) => r >= b.min && r < b.max) ?? BANDS[BANDS.length - 1];
