import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import Icon from '../components/Icon';

function resizeImageToDataUrl(file: File, maxSize = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context unavailable'));
        // Center-crop square
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Profiles() {
  const { profiles, profile, switchProfile, addProfile, updateProfileAvatar, deleteProfile, t } = useStore();
  const [name, setName] = useState('');
  const [newAvatar, setNewAvatar] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  const onPickNewFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const dataUrl = await resizeImageToDataUrl(f);
      setNewAvatar(dataUrl);
    } catch {}
  };

  const onPickExistingFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !editingProfileId) return;
    try {
      const dataUrl = await resizeImageToDataUrl(f);
      updateProfileAvatar(editingProfileId, dataUrl);
    } catch {}
    setEditingProfileId(null);
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    addProfile(name, newAvatar);
    setName('');
    setNewAvatar(undefined);
  };

  return (
    <div>
      <h2 className="h">{t('prof_title')}</h2>
      <p className="muted" style={{ marginTop: -6, marginBottom: 14 }}>
        {t('prof_desc')}
      </p>

      {/* Скрытые input type="file" */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onPickNewFile}
      />
      <input
        ref={editFileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onPickExistingFile}
      />

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div
            className="avatar-upload-preview"
            onClick={() => fileInputRef.current?.click()}
            title={t('prof_upload_avatar')}
          >
            {newAvatar ? (
              <img src={newAvatar} alt="" />
            ) : (
              <Icon name="upload" size={20} />
            )}
          </div>

          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            <Icon name="upload" size={16} /> {t('prof_upload_avatar')}
          </button>

          <input
            className="input grow"
            placeholder={t('prof_name_placeholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />

          <button className="btn primary" onClick={handleCreate}>
            <Icon name="plus" size={18} /> {t('prof_create')}
          </button>
        </div>
      </div>

      <div className="list">
        {profiles.map((p) => {
          const active = p.id === profile.id;
          const initial = (p.name || 'U').trim().charAt(0).toUpperCase();
          return (
            <div key={p.id} className="panel row" style={active ? { borderColor: 'var(--accent)' } : undefined}>
              <div
                className="avatar big"
                onClick={() => {
                  setEditingProfileId(p.id);
                  editFileRef.current?.click();
                }}
                title={t('prof_change_avatar')}
                style={{ cursor: 'pointer' }}
              >
                {p.avatar ? <img src={p.avatar} alt={p.name} /> : <span>{initial}</span>}
              </div>
              <div className="grow">
                <b>{p.name}</b>
                {active && <div className="muted">{t('prof_active')}</div>}
              </div>
              <button
                className="btn small-btn"
                onClick={() => {
                  setEditingProfileId(p.id);
                  editFileRef.current?.click();
                }}
              >
                <Icon name="upload" size={14} /> {t('prof_change_avatar')}
              </button>
              {!active && (
                <button className="btn" onClick={() => switchProfile(p.id)}>
                  {t('prof_select')}
                </button>
              )}
              {profiles.length > 1 && (
                <button className="iconbtn" onClick={() => deleteProfile(p.id)}>
                  <Icon name="trash" size={18} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
