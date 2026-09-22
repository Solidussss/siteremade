// Product-flow pass, spec item 14: "architect handoff to SUPPORT video
// resources (not auto-render personalized videos this pass)... initially
// configurable hosted video URLs, structured to support later
// project-specific walkthroughs." A small, config-driven list -- each
// entry's `url` is read from its own env var so a real deployment can
// point these at real hosted videos. Left `null` when unconfigured, NEVER
// fabricated -- same discipline lib/hosting.js already applies to
// `affiliateUrl` (a real, empty configuration surface, not a placeholder
// value pretending to be live). `key` is stable so a later pass can extend
// an entry with a project-specific override without renaming anything.
'use strict';

const RESOURCES = [
  { key: 'upload', title: 'How to upload your website', urlEnv: 'SITEREMADE_GUIDE_UPLOAD_URL' },
  { key: 'domain', title: 'How to connect your domain', urlEnv: 'SITEREMADE_GUIDE_DOMAIN_URL' },
  { key: 'edit', title: 'How to change text and images', urlEnv: 'SITEREMADE_GUIDE_EDIT_URL' },
  { key: 'publish', title: 'How to publish updates', urlEnv: 'SITEREMADE_GUIDE_PUBLISH_URL' },
  { key: 'files', title: 'Understanding your website files', urlEnv: 'SITEREMADE_GUIDE_FILES_URL' },
];

function listHandoffResources() {
  return RESOURCES.map(r => ({ key: r.key, title: r.title, url: process.env[r.urlEnv] || null }));
}

module.exports = { listHandoffResources };
