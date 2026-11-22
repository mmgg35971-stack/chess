"""Fit the expected-points model and the Game Rating model.

Input: JSONL from analyze.mjs (real rated Lichess games, CC0, analysed with the
app's Stockfish build at depth 12, MultiPV 2). Output: src/data/ep-model.json
and src/data/game-rating-model.json. Mirrors src/lib/analysis/{expected,
classify,gameRating}.ts exactly.
usage: python3 fit.py out0.jsonl out1.jsonl ...
"""
import json, math, sys, random, os
import numpy as np
from scipy.optimize import minimize

REF = 1500.0
games = []
for f in sys.argv[1:]:
    for line in open(f):
        line = line.strip()
        if line:
            games.append(json.loads(line))
print('games', len(games))

def res_white(r):
    return {'1-0': 1.0, '0-1': 0.0, '1/2-1/2': 0.5}.get(r)

# ---------- 1. expected points: E = 1/(1+exp(-k(r)*cp)), k(r) = k0 + k1*(r-REF)/1000
EP_SET = os.environ.get('EP_SET', 'classical')
X_cp, X_r, Y = [], [], []
for g in games:
    if EP_SET == 'classical' and 'Classical' not in g['h']['Event']: continue
    rw = res_white(g['h']['Result'])
    if rw is None: continue
    ev = g['evals']
    for i in range(8, min(len(ev), 120)):
        e = ev[i]
        if not e or not e['a'] or e['a'].get('cp') is None: continue
        white_to_move = i % 2 == 0
        sign = 1 if white_to_move else -1
        cp = max(-1500, min(1500, e['a']['cp'] * sign))
        rating = g['h']['WhiteElo'] if white_to_move else g['h']['BlackElo']
        y = rw if white_to_move else 1 - rw
        X_cp.append(cp); X_r.append(rating); Y.append(y)
X_cp, X_r, Y = map(np.array, (X_cp, X_r, Y))
print('EP set', EP_SET, 'positions', len(Y))

# E = 1/(1+exp(-a(r) * sign(cp) * (|cp|/100)^p)),  a(r) = a0 + a1*(r-REF)/1000
def ep_arr(a0, a1, pw, cp, r):
    a = np.maximum(0.05, a0 + a1 * (np.clip(r, 800, 2600) - REF) / 1000)
    x = np.sign(cp) * np.power(np.abs(cp) / 100.0, pw)
    return 1 / (1 + np.exp(-a * x))

def nll(p):
    a0, a1, pw = p
    e = np.clip(ep_arr(a0, a1, pw, X_cp, X_r), 1e-6, 1 - 1e-6)
    return -np.mean(Y * np.log(e) + (1 - Y) * np.log(1 - e))

fit = minimize(nll, [0.4, 0.0, 0.7], method='Nelder-Mead', options={'xatol': 1e-7, 'fatol': 1e-10, 'maxiter': 8000})
a0, a1, pw = fit.x
lin = minimize(lambda q: nll([q[0], q[1], 1.0]), [0.2, 0.0], method='Nelder-Mead').x
flat = minimize(lambda q: nll([q[0], 0.0, q[1]]), [0.4, 0.7], method='Nelder-Mead').x
print(f'EP fit: a0={a0:.4f} a1={a1:.4f} power={pw:.3f}  nll {fit.fun:.5f} | linear-logistic nll {nll([lin[0], lin[1], 1.0]):.5f} | no-rating nll {nll([flat[0], 0, flat[1]]):.5f}')
for r in (1000, 1500, 2000, 2500):
    vals = [float(ep_arr(a0, a1, pw, np.array([c]), np.array([r]))[0]) for c in (100, 300, 700, 1500)]
    print(f'  rating {r}: +1 {vals[0]:.3f}  +3 {vals[1]:.3f}  +7 {vals[2]:.3f}  +15 {vals[3]:.3f}')

def ep(score, white_mover, rating):
    if score is None: return 0.5
    sign = 1 if white_mover else -1
    if score.get('mate') is not None:
        m = score['mate'] * sign
        return 1.0 if m > 0 else 0.0
    cp = max(-1500, min(1500, score['cp'] * sign))
    return float(ep_arr(a0, a1, pw, np.array([cp]), np.array([rating]))[0])

def move_acc(loss):
    pct = max(0, loss) * 100
    return max(0, min(100, 103.1668 * math.exp(-0.04354 * pct) - 3.1669))

# ---------- 2. Game Rating features (fixed reference curve at REF), per side of each game
def side_features(g, white):
    ev, sans = g['evals'], g['sans']
    losses, best, cpl = [], 0, []
    for i in range(len(sans)):
        if (i % 2 == 0) != white: continue
        if i + 1 >= len(ev): break
        a, nxt = ev[i], ev[i + 1]
        if not a or not a['a']: continue
        b_ep = ep(a['a'], white, REF)
        if nxt is None:  # game over after the move (mate / draw)
            p_ep = 1.0 if g['h']['Result'] == ('1-0' if white else '0-1') else 0.5
        elif not nxt['a']:
            continue
        else:
            p_ep = ep(nxt['a'], white, REF)
        # is the played move the engine's first choice?  compare SAN-free: use pv uci vs recomputed loss
        is_best = abs(b_ep - p_ep) < 1e-9 or p_ep >= b_ep
        losses.append(0.0 if is_best else max(0.0, b_ep - p_ep))
        def cpv(sc):
            if sc is None: return None
            if sc.get('mate') is not None: return 1000 if sc['mate'] * (1 if white else -1) > 0 else -1000
            return max(-1000, min(1000, sc['cp'] * (1 if white else -1)))
        bc, pc = cpv(a['a']), (cpv(nxt['a']) if nxt else None)
        if bc is not None and pc is not None: cpl.append(max(0, bc - pc))
        best += 1 if is_best else 0
    n = len(losses)
    if n < 10: return None
    acc = [move_acc(l) for l in losses]
    harm = n / sum(1 / max(a, 1) for a in acc)
    return {
        'accuracy': (sum(acc) / n + harm) / 2,
        'logLoss': math.log(sum(losses) / n + 0.005),
        'mistakeRate': sum(1 for l in losses if l > 0.1) / n,
        'blunderRate': sum(1 for l in losses if l > 0.2) / n,
        'bestRate': best / n,
        'logMoves': math.log(n),
        'logAcpl': math.log(sum(cpl) / max(len(cpl), 1) + 5),
    }

rows = []
for g in games:
    for white in (True, False):
        f = side_features(g, white)
        if f: rows.append((f, g['h']['WhiteElo'] if white else g['h']['BlackElo'], g['idx']))
keys = ['accuracy', 'logLoss', 'mistakeRate', 'blunderRate', 'bestRate', 'logMoves', 'logAcpl']
F = np.array([[r[0][k] for k in keys] for r in rows]); R = np.array([r[1] for r in rows]); G = np.array([r[2] for r in rows])
mu, sd = F.mean(0), F.std(0) + 1e-9
Z = (F - mu) / sd
print('player-games', len(R), 'rating mean', R.mean().round(), 'sd', R.std().round())

def ridge(Zt, Rt, lam=1.0):
    A = np.hstack([np.ones((len(Zt), 1)), Zt])
    I = np.eye(A.shape[1]); I[0, 0] = 0
    return np.linalg.solve(A.T @ A + lam * I, A.T @ Rt)

# 5-fold CV grouped by game (both sides of a game stay in the same fold)
ug = np.unique(G); random.seed(7); random.shuffle(ug := list(ug))
folds = [set(ug[i::5]) for i in range(5)]
pred = np.zeros(len(R))
for fs in folds:
    te = np.array([g in fs for g in G]); tr = ~te
    w = ridge(Z[tr], R[tr]); pred[te] = np.hstack([np.ones((te.sum(), 1)), Z[te]]) @ w
mae = np.mean(np.abs(pred - R)); rmse = math.sqrt(np.mean((pred - R) ** 2))
base_mae = np.mean(np.abs(R - R.mean()))
corr = np.corrcoef(pred, R)[0, 1]
print(f'Game Rating CV: MAE {mae:.0f}, RMSE {rmse:.0f}, corr {corr:.3f}; baseline (always mean) MAE {base_mae:.0f}')
w = ridge(Z, R)
# Measurement model for Bayesian use: quality score s = linear predictor; s | r ~ N(alpha + beta*r, sigma^2)
S = np.hstack([np.ones((len(Z), 1)), Z]) @ w
beta, alpha = np.polyfit(R, S, 1)
sigma = float(np.std(S - (alpha + beta * R)))
# check: posterior with the population prior reproduces the regression; with a personal prior (sd 150) the error shrinks
def post(s, pm, psd):
    prec = 1 / psd**2 + beta**2 / sigma**2
    return (pm / psd**2 + beta * (s - alpha) / sigma**2) / prec, math.sqrt(1 / prec)
Scv = pred  # cross-validated scores
pp = np.array([post(sv, R.mean(), R.std())[0] for sv in Scv])
print(f'posterior (population prior) MAE {np.mean(np.abs(pp - R)):.0f}; posterior sd {post(0, R.mean(), R.std())[1]:.0f}')
rng = np.random.default_rng(1)
noisy_prior = R + rng.normal(0, 150, len(R))   # a player who knows their rating to +-150
pp2 = np.array([post(sv, pr, 150)[0] for sv, pr in zip(Scv, noisy_prior)])
print(f'with a personal prior (sd 150): MAE {np.mean(np.abs(pp2 - R)):.0f} vs prior alone {np.mean(np.abs(noisy_prior - R)):.0f}; posterior sd {post(0, 1500, 150)[1]:.0f}')
model = {
    'intercept': float(w[0]), 'coef': {k: float(c) for k, c in zip(keys, w[1:])},
    'mean': {k: float(m) for k, m in zip(keys, mu)}, 'std': {k: float(s) for k, s in zip(keys, sd)},
    'mae': float(mae), 'rmse': float(rmse), 'baselineMae': float(base_mae), 'corr': float(corr),
    'alpha': float(alpha), 'beta': float(beta), 'sigma': sigma, 'popMean': float(R.mean()), 'popSd': float(R.std()),
    'games': len(games), 'playerGames': len(R), 'minMoves': 10,
    'source': 'Lichess standard rated games, Sept 2017 (CC0, 1000-game sample shipped in the jja crate); bullet excluded; analysed with Stockfish.js 19 lite, depth 12, MultiPV 2; 5-fold cross-validated',
}
epm = {'a0': float(a0), 'a1': float(a1), 'power': float(pw), 'ref': REF, 'minRating': 800, 'maxRating': 2600,
       'games': len(games), 'positions': int(len(Y)), 'nll': float(fit.fun), 'set': EP_SET,
       'source': model['source']}
out = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'src', 'data') + '/'
json.dump(epm, open(out + 'ep-model.json', 'w'), indent=1)
json.dump(model, open(out + 'game-rating-model.json', 'w'), indent=1)
print('written', out)
# show predictions by rating band
for lo in range(800, 2600, 300):
    m = (R >= lo) & (R < lo + 300)
    if m.sum(): print(f'  band {lo}-{lo+300}: n={m.sum()} mean pred {pred[m].mean():.0f}')
