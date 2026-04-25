'use client';

import { motion } from 'framer-motion';

type Props = { score: number; tone: 'high' | 'mid' | 'low' };

const COLORS = { high: '#00d1b6', mid: '#f0b429', low: '#e74c3c' };
const R = 36;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function ScoreRing({ score, tone }: Props) {
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" aria-label={`Odak puanı: ${score}`}>
      <circle
        cx="46" cy="46" r={R}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="6"
      />
      <motion.circle
        cx="46" cy="46" r={R}
        fill="none"
        stroke={COLORS[tone]}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        initial={{ strokeDashoffset: CIRCUMFERENCE }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
        transform="rotate(-90 46 46)"
      />
      <text
        x="46" y="46"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="15"
        fontWeight="700"
        fill="#e6f1ff"
        fontFamily="inherit"
      >
        {score}
      </text>
    </svg>
  );
}
