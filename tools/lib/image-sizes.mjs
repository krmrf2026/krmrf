// Keep these source-size hints aligned with style.css/page-index.css/page-content.css.
// The existing layouts and image files are unchanged; only resource selection is corrected.
export const ARTICLE_IMAGE_SIZES = '(max-width: 520px) calc(100vw - 1.25rem - clamp(2.5rem, 8vw, 6.7rem) - 2px), calc(min(100vw - 2rem, 760px) - clamp(2.5rem, 8vw, 6.7rem) - 2px)';

export const cardImageSizes = layout => {
  const small = '(max-width: 520px) calc(100vw - 1.25rem - 2px)';
  const single = '(max-width: 640px) calc(100vw - 2rem - 2px)';
  if (layout === 'feature') {
    return `${small}, (max-width: 900px) calc(100vw - 2rem - 2px), calc((min(100vw - 2rem, 1160px) - 3.5rem) * .64 - 2px)`;
  }
  if (layout === 'three') {
    return `${small}, ${single}, (max-width: 900px) calc((100vw - 3.5rem) / 2 - 2px), calc((min(100vw - 2rem, 1160px) - 3rem) / 3 - 2px)`;
  }
  return `${small}, ${single}, calc((min(100vw - 2rem, 1160px) - 1.5rem) / 2 - 2px)`;
};
