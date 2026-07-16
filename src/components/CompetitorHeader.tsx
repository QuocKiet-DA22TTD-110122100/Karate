import type { ReactNode } from 'react';
import type { Side, Competitor } from '../types';
import Flag from './Flag';

interface CompetitorHeaderProps {
  side: Side;
  competitor: Competitor;
  /** 'corner' pushes content to the screen edge (kumite); 'center' stacks centered (kata). */
  variant?: 'corner' | 'center';
  children?: ReactNode; // e.g. AO/AK tab or a select control
}

export default function CompetitorHeader({
  side,
  competitor,
  variant = 'center',
  children,
}: CompetitorHeaderProps) {
  const align = variant === 'center' ? 'items-center text-center' : 'items-start text-left';
  return (
    <div className={`flex flex-col gap-1 ${align}`}>
      <Flag country={competitor.country} />
      {children}
      <div className="mt-1 text-lg font-bold text-white">{competitor.unit}</div>
      <div className="text-xl font-bold text-white">{competitor.name}</div>
      <span className="sr-only">{side}</span>
    </div>
  );
}
