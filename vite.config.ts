import { defineConfig } from 'vite';

// Relative asset paths, so the built game in dist/ works from any folder on
// any static host: a GitHub Pages project page, a subfolder of a personal
// site, Netlify, or just opened from a local web server.
export default defineConfig({
  base: './',
});
