import MenuBlock from '../components/MenuBlock';

export default function MenuScreen() {
  return (
    <div className="flex h-full w-full gap-3 bg-white p-3">
      <MenuBlock label="kata" to="/control/kata" color="#e01f1f" />
      <MenuBlock label="bốc thăm" to="/draw" color="#8ed89a" />
      <MenuBlock label="kumite" to="/control/kumite" color="#1a1ae0" />
    </div>
  );
}
