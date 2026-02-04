const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const templatePath = path.join(rootDir, 'static-pages', 'layout.html');
const pagesDir = path.join(rootDir, 'static-pages', 'pages');
const assetsDir = path.join(rootDir, 'static-pages', 'assets');
const publicDir = path.join(rootDir, 'public');

const pages = [
  {
    slug: 'privacy',
    title: 'Privacy Policy | MinutesMap',
    description: 'Privacy policy for MinutesMap. Learn what data we collect and how we use it.',
    contentFile: 'privacy.html',
  },
  {
    slug: 'about',
    title: 'About | MinutesMap',
    description: 'Learn about MinutesMap and how it helps you follow live basketball games.',
    contentFile: 'about.html',
  },
];

function renderTemplate(template, replacements) {
  return Object.entries(replacements).reduce((html, [key, value]) => {
    const token = new RegExp(`{{${key}}}`, 'g');
    return html.replace(token, value);
  }, template);
}

const template = fs.readFileSync(templatePath, 'utf8');

function copyDir(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  entries.forEach(entry => {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
      return;
    }

    fs.copyFileSync(sourcePath, targetPath);
  });
}

copyDir(assetsDir, path.join(publicDir, 'static-pages'));

pages.forEach(page => {
  const contentPath = path.join(pagesDir, page.contentFile);
  const content = fs.readFileSync(contentPath, 'utf8');
  const outputDir = path.join(publicDir, page.slug);
  const outputPath = path.join(outputDir, 'index.html');

  fs.mkdirSync(outputDir, { recursive: true });

  const html = renderTemplate(template, {
    TITLE: page.title,
    DESCRIPTION: page.description,
    CONTENT: content.trim(),
  });

  fs.writeFileSync(outputPath, html);
  process.stdout.write(`Generated ${path.relative(rootDir, outputPath)}\n`);
});
