// Tailwind through PostCSS, the setup Next.js documents. The @tailwindcss/turbopack loader we used
// before served globals.css one edit late in dev on Windows (it only rebuilt on an mtime change).
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
