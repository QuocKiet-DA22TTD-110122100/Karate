import { Routes, Route } from 'react-router-dom';
import MenuScreen from './screens/MenuScreen';
import KumiteScoreboard from './screens/KumiteScoreboard';
import KataScoreboard from './screens/KataScoreboard';
import DrawScreen from './screens/DrawScreen';
import ControlKumite from './screens/ControlKumite';
import ControlKata from './screens/ControlKata';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MenuScreen />} />
      <Route path="/kumite" element={<KumiteScoreboard />} />
      <Route path="/control/kumite" element={<ControlKumite />} />
      <Route path="/kata" element={<KataScoreboard />} />
      <Route path="/control/kata" element={<ControlKata />} />
      <Route path="/draw" element={<DrawScreen />} />
    </Routes>
  );
}
