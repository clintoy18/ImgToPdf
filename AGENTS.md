# Repository Guidelines

## Project Structure & Module Organization

This is a Vite + React image-to-PDF application. Source code lives in `src/`: `main.jsx` mounts the app, `App.jsx` contains the main UI logic, and `App.css`/`index.css` hold component and global styles. Static files served directly by Vite live in `public/`, including `favicon.svg` and `icons.svg`. Bundled image assets belong in `src/assets/`, such as `hero.png`. The production build output is `dist/` and is intentionally ignored by ESLint.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: start the local Vite development server with hot module replacement.
- `npm run build`: create a production build in `dist/`.
- `npm run preview`: serve the production build locally for verification.
- `npm run lint`: run ESLint over the repository.

There is no test command configured yet. Add one to `package.json` before introducing automated tests.

## Coding Style & Naming Conventions

Use modern ES modules and React function components. Keep JSX files in `src/` with `.jsx` extensions when they render React components, and use `.js` for non-JSX utilities. Name React components in `PascalCase` and hooks with the `useSomething` pattern. Prefer descriptive state and handler names, for example `selectedImages` or `handleFileUpload`.

Follow the existing style: two-space indentation, single quotes, semicolon-free JavaScript, and concise imports. Run `npm run lint` before committing. ESLint uses `@eslint/js`, `eslint-plugin-react-hooks`, and Vite React Refresh rules.

## Testing Guidelines

No testing framework is currently installed. For future tests, prefer Vitest with React Testing Library to match the Vite stack. Place tests near the code they cover using names like `App.test.jsx` or `imageUtils.test.js`. Cover file upload, PDF generation, OCR behavior, and error states before changing those flows.

## Commit & Pull Request Guidelines

The existing history uses very short commit messages such as `first commit` and `v1`. Keep messages brief but more descriptive going forward, for example `Add image ordering controls` or `Fix PDF export sizing`.

Pull requests should include a summary of user-visible changes, validation steps such as `npm run lint` and `npm run build`, and screenshots or screen recordings for UI changes. Link related issues when available and call out any new dependencies or browser API assumptions.

## Security & Configuration Tips

Do not commit generated `dist/` output, local environment files, or large user-uploaded sample images. Keep image and OCR processing client-side unless a backend is added with explicit privacy handling.
