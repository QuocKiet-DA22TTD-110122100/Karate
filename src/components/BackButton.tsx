import { useNavigate } from 'react-router-dom';

export default function BackButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/')}
      className="absolute left-4 top-4 z-10 rounded bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
    >
      ← Menu
    </button>
  );
}
