/**
 * Open the projected board in its own window.
 *
 * The URL is built from Vite's BASE_URL (which is "/Karate/" on GitHub Pages,
 * "/" in dev) plus a hash route, so the pop-out lands on the right page whether
 * the app is served from a domain root or a project sub-path.
 */
export function openDisplay(route: 'kumite' | 'kata'): void {
  const url = `${import.meta.env.BASE_URL}#/${route}`;
  window.open(url, 'karate-display', 'width=1280,height=800');
}
