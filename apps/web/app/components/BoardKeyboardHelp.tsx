'use client';

import { motion } from 'framer-motion';
import { useEffect } from 'react';

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ['N'], desc: 'Yeni kart (To Do kolonunda)' },
  { keys: ['/'], desc: 'Aramayı odakla' },
  { keys: ['Esc'], desc: 'Modal/form kapat veya filtre temizle' },
  { keys: ['?'], desc: 'Bu yardım panelini aç/kapat' },
  { keys: ['Ctrl', 'S'], desc: 'Modal içinde manuel kaydet' },
  { keys: ['Ctrl', 'Enter'], desc: 'Modal içinde anında kaydet ve kapat' },
  { keys: ['Del'], desc: 'Toplu seçim modunda seçilenleri sil' },
];

type Props = { onClose: () => void };

export function BoardKeyboardHelp({ onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      className="boardModalBackdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="boardKeyboardHelp"
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="boardModalHeader">
          <h2 className="boardKeyboardHelpTitle">Klavye Kısayolları</h2>
          <button type="button" className="boardModalClose" onClick={onClose} aria-label="Kapat">×</button>
        </header>
        <ul className="boardKeyboardHelpList">
          {SHORTCUTS.map((s, i) => (
            <li key={i} className="boardKeyboardHelpRow">
              <span className="boardKeyboardHelpKeys">
                {s.keys.map((k, j) => (
                  <kbd key={j}>{k}</kbd>
                ))}
              </span>
              <span className="boardKeyboardHelpDesc">{s.desc}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}
