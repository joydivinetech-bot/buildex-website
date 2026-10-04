export const categories = ['Flooring','Patios','Outdoor Kitchens','Concrete','Remodeling','Handyman','MEP','Other'];
export const pages = ['home','services','flooring','estimate','projects','about','contact'];
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Size unavailable';
  return bytes < 1000000 ? Math.round(bytes / 1000) + ' KB' : (bytes / 1000000).toFixed(1) + ' MB';
}
// Source rectangle for a crop constrained to the original image, including edge positions.
export function cropRect(width, height, ratio, zoom = 1, x = .5, y = .5, maximum = 1200) {
  ratio = Number(ratio) || width / height;
  zoom = Math.max(1, Number(zoom) || 1);
  let sw = Math.min(width, height * ratio) / zoom, sh = sw / ratio;
  const scale = Math.min(1, maximum / Math.max(sw, sh));
  return {sx: (width - sw) * Math.max(0, Math.min(1, x)), sy: (height - sh) * Math.max(0, Math.min(1, y)),
    sw, sh, width: Math.max(1, Math.round(sw * scale)), height: Math.max(1, Math.round(sh * scale))};
}
export function previewCollection(projects, working) {
  const collection = projects.map(project => ({...project, photos: [...project.photos]}));
  if (!working) return collection;
  const index = collection.findIndex(project => project.id === working.id);
  if (index >= 0) collection[index] = working; else collection.push(working);
  return collection;
}
export function previewPage(href, base) {
  const url = new URL(href, base);
  if (url.origin !== new URL(base).origin) return null;
  const name = url.pathname.replace(/^\/|\/$/g, '').replace(/\.html$/, '');
  return name === '' || name === 'index' ? 'home' : pages.includes(name) ? name : null;
}
export function photoMetadata(photo) {
  return [photo.width && photo.height ? photo.width + ' × ' + photo.height + ' px' : 'Dimensions load when opened', photo.bytes ? formatBytes(photo.bytes) : null].filter(Boolean).join(' · ');
}
