import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { BOARD_THEMES, PIECE_SETS, type Settings as S } from '../../lib/settings';
import { exportBackup, restoreBackup, updateProfile, wipeAll } from '../../lib/storage/repo';
import { pickTextFile, saveTextFile, stamp } from '../../lib/files';
import { getEngine } from '../../lib/engine/engine';
import { Segmented } from './Play';

export function Avatar({ name, src, size = 48 }: { name: string; src?: string; size?: number }) {
  if (src) return <img className="avatar" src={src} alt="" width={size} height={size} />;
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="avatar" style={{ width: size, height: size, background: `hsl(${h} 45% 40%)`, fontSize: size * 0.45 }}>
      {letter}
    </span>
  );
}

function pickImage(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = 160;
        const s = Math.min(img.width, img.height);
        c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 160, 160);
        resolve(c.toDataURL('image/jpeg', 0.85));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(f);
    };
    input.click();
  });
}

export function Settings() {
  const { t, settings, setSettings, profile, refreshProfile, toast, bumpData } = useApp();
  const [name, setName] = useState(profile?.name ?? '');
  const [engineName, setEngineName] = useState('');
  useEffect(() => setName(profile?.name ?? ''), [profile?.name]);
  useEffect(() => { getEngine().whenReady().then(() => setEngineName(getEngine().name)); }, []);

  const toggle = (k: keyof S, label: string) => (
    <label className="switch-row">
      <span>{label}</span>
      <input type="checkbox" checked={settings[k] as boolean} onChange={(e) => setSettings({ [k]: e.target.checked } as Partial<S>)} />
    </label>
  );

  const saveName = async () => {
    await updateProfile({ name: name.trim() || t('defaultName') });
    await refreshProfile();
    toast(t('saved'));
  };

  const doBackup = async () => {
    const b = await exportBackup();
    await saveTextFile(`chess-academy-backup-${stamp()}.json`, JSON.stringify(b), 'application/json');
  };

  const doRestore = async () => {
    const text = await pickTextFile('.json,application/json');
    if (!text || !window.confirm(t('restoreConfirm'))) return;
    try {
      await restoreBackup(JSON.parse(text));
      toast(t('restored'));
      location.reload();
    } catch {
      toast(t('restoreFailed'));
    }
  };

  const doWipe = async () => {
    const answer = window.prompt(t('wipeConfirm'));
    if (answer?.trim() !== t('wipeWord')) return;
    await wipeAll();
    toast(t('wiped'));
    bumpData();
    location.reload();
  };

  return (
    <div className="screen">
      <h1>{t('nav_settings')}</h1>

      <section className="card">
        <h2>{t('profile')}</h2>
        <div className="row gap">
          <Avatar name={profile?.name ?? ''} src={profile?.avatar} size={56} />
          <button className="btn" onClick={async () => { const a = await pickImage(); if (a) { await updateProfile({ avatar: a }); await refreshProfile(); } }}>{t('changeAvatar')}</button>
          {profile?.avatar && <button className="btn" onClick={async () => { await updateProfile({ avatar: undefined }); await refreshProfile(); }}>{t('removeAvatar')}</button>}
        </div>
        <label className="field">
          <span>{t('name')}</span>
          <div className="row gap">
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} data-testid="name-input" />
            <button className="btn primary" onClick={saveName} data-testid="save-name">{t('save')}</button>
          </div>
        </label>
      </section>

      <section className="card">
        <h2>{t('appearance')}</h2>
        <div className="field"><span>{t('language')}</span>
          <Segmented value={settings.lang} onChange={(v) => setSettings({ lang: v as S['lang'] })} options={[['ar', 'العربية'], ['en', 'English']]} />
        </div>
        <div className="field"><span>{t('theme')}</span>
          <Segmented value={settings.theme} onChange={(v) => setSettings({ theme: v as S['theme'] })} options={[['dark', t('dark')], ['light', t('light')]]} />
        </div>
      </section>

      <section className="card">
        <h2>{t('board')}</h2>
        <div className="field"><span>{t('boardColors')}</span>
          <div className="swatches">
            {BOARD_THEMES.map((b) => (
              <button key={b.id} aria-label={b.id} className={'swatch' + (settings.boardTheme === b.id ? ' on' : '')}
                style={{ background: `linear-gradient(135deg, ${b.light} 50%, ${b.dark} 50%)` }}
                onClick={() => setSettings({ boardTheme: b.id })} />
            ))}
          </div>
        </div>
        <div className="field"><span>{t('pieces')}</span>
          <div className="swatches">
            {PIECE_SETS.map((ps) => (
              <button key={ps} className={'swatch piece' + (settings.pieceSet === ps ? ' on' : '')} onClick={() => setSettings({ pieceSet: ps })} aria-label={ps}>
                <img src={`./pieces/${ps}/wN.svg`} alt="" /><img src={`./pieces/${ps}/bQ.svg`} alt="" />
              </button>
            ))}
          </div>
        </div>
        {toggle('coordinates', t('coordinates'))}
        {toggle('showLastMove', t('lastMove'))}
        {toggle('showLegal', t('legalMoves'))}
        {toggle('sound', t('sound'))}
      </section>

      <section className="card">
        <h2>{t('analysis')}</h2>
        <div className="field"><span>{t('engine')}</span><span className="muted" dir="ltr">{engineName || '…'} (WASM lite, 1 thread)</span></div>
        <p className="muted small">{t('analysisSoon')}</p>
      </section>

      <section className="card">
        <h2>{t('data')}</h2>
        <div className="row gap wrap">
          <button className="btn" onClick={doBackup} data-testid="backup">{t('exportBackup')}</button>
          <button className="btn" onClick={doRestore}>{t('importBackup')}</button>
          <button className="btn danger" onClick={doWipe}>{t('wipe')}</button>
        </div>
      </section>

      <section className="card">
        <h2>{t('about')}</h2>
        <p className="muted small">{t('aboutText')}</p>
      </section>
    </div>
  );
}
