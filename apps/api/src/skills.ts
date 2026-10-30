import type Router from '@koa/router';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { projectRoot } from './config.js';

// Bundled MedSci / AIPOCH skills live in the repository root; the page and
// one-command install pull from here. MIT licensed, public read-only.
const skillsRoot = path.join(projectRoot, 'skills');
const manifest = JSON.parse(fs.readFileSync(path.join(skillsRoot, 'manifest.json'), 'utf8')) as {
  title: string;
  intro: string;
  sections: { id: string; title: string }[];
  skills: { slug: string; title: string; section: string; summary: string; source: string; homepage: string; url: string }[];
};
const sectionOrder = manifest.sections.map(s => s.id);
const manifestSkills = [...manifest.skills].sort(
  (a, b) => sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section) || a.title.localeCompare(b.title, 'zh-CN'),
);

function skillStats(slug: string) {
  const dir = path.join(skillsRoot, slug);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  let files = 0, bytes = 0;
  const stack = [dir];
  while (stack.length) {
    for (const entry of fs.readdirSync(stack.pop()!, { withFileTypes: true })) {
      const full = path.join(entry.parentPath ?? entry.path, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else { files++; bytes += fs.statSync(full).size; }
    }
  }
  return { files, bytes };
}

/** Stream a tar.gz of the given skill directories. Requires system tar (Linux/macOS). */
function streamTar(ctx: any, names: string[], filename: string) {
  ctx.type = 'application/gzip';
  ctx.set('Content-Disposition', `attachment; filename="${filename}"`);
  ctx.set('Cache-Control', 'public, max-age=300');
  ctx.set('X-Content-Type-Options', 'nosniff');
  const child = spawn('tar', ['-czf', '-', '-C', skillsRoot, '--', ...names]);
  let error = '';
  child.stderr.on('data', chunk => { error += String(chunk); });
  child.on('error', () => { ctx.status = 500; ctx.body = { error: 'Archive unavailable' }; });
  child.stdout.on('error', () => { ctx.status = 500; ctx.body = { error: 'Archive failed' }; });
  child.on('close', code => { if (code !== 0 && !ctx.headerSent) { ctx.status = 500; ctx.body = { error: error || 'Archive failed' }; } });
  ctx.body = child.stdout;
}

export function registerSkills(r: Router) {
  r.get('/skills', ctx => {
    ctx.set('Cache-Control', 'public, max-age=300');
    ctx.body = {
      title: manifest.title,
      intro: manifest.intro,
      sections: manifest.sections,
      bundleUrl: '/api/skills/bundle.tar.gz',
      skills: manifestSkills
        .map(skill => ({ ...skill, ...skillStats(skill.slug)!, downloadUrl: `/api/skills/${skill.slug}.tar.gz` }))
        .filter(skill => skill.files > 0),
    };
  });

  r.get('/skills/bundle.tar.gz', ctx => streamTar(ctx, manifestSkills.map(s => s.slug), 'xiake-med-research-skills.tar.gz'));
  r.get('/skills/:slug.tar.gz', ctx => {
    const slug = ctx.params.slug as string;
    if (!manifestSkills.some(s => s.slug === slug) || !skillStats(slug)) {
      ctx.status = 404; ctx.body = { error: 'Not found' }; return;
    }
    streamTar(ctx, [slug], `${slug}.tar.gz`);
  });
}