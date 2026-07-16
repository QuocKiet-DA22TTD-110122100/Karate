import { useNavigate } from 'react-router-dom';

interface MenuBlockProps {
  label: string;
  to: string;
  color: string; // tailwind bg class or hex via style
}

export default function MenuBlock({ label, to, color }: MenuBlockProps) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      style={{ backgroundColor: color }}
      className="flex h-full flex-1 items-center justify-center text-6xl font-medium text-white transition-transform hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-white/50"
    >
      {label}
    </button>
  );
}
