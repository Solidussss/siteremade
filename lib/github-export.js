// Phase G (product-flow pass): the GitHub export/deploy abstraction
// interface, documented but NOT wired into any route or the UI.
//
// Per this pass's own stop condition ("if too large for this pass, do not
// fake it -- create a clean exporter interface, document what remains"):
// this module is the contract a real GitHub integration would implement --
// push a compiled export to a repo, optionally trigger a Pages/Actions
// deploy from it -- following the EXACT same adapter-contract pattern
// already established by lib/adapters/production-database-adapter.js (fail
// closed with a specific, actionable error; never a silent no-op; never a
// simulated success). It is deliberately never require()'d by server.js or
// mock-server.js, and no route or UI element references it -- there is
// nothing in this codebase today that could honestly claim "push to
// GitHub" works, so nothing claims it.
//
// What's genuinely missing, confirmed by inspection before writing this
// file:
//   - No GitHub App / OAuth App / personal-access-token credential is
//     configured anywhere in this repo or this sandbox's environment (no
//     GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY / GITHUB_TOKEN of any kind).
//   - No GitHub API client is installed (this sandbox's `npm install` is
//     confirmed blocked -- see SITE-PROJECT-V8.5.md part 1 -- and a
//     from-scratch REST client, OAuth device/web flow, and per-account
//     repo/credential storage model is real scope this pass's own audit
//     explicitly said not to fake).
//   - Deciding what "deploy" even means once pushed (GitHub Pages for
//     static exports? Actions-triggered deploy to one of lib/hosting.js's
//     targets for server_required ones? a customer's own repo, or a
//     SiteRemade-owned one they're invited to?) is a real product decision
//     nothing in the brief settled -- guessing one here would bake an
//     unreviewed assumption into a "working" feature.
//
// The shape below mirrors this codebase's real, working export path
// (lib/export-compiler.js's compileExport + lib/archive.js's zipDirectory +
// lib/deployment-store.js's deployment records) closely on purpose: a real
// implementation should reuse compileExport's already-compiled workDir as
// its push source (never recompile the site a second, different way), and
// should record its own attempts through deployment-store.js exactly like
// the 'local' target does today (same createReadyDeployment/
// recordFailedDeployment shape, target: 'github' instead of 'local') so
// My Websites and every other deployment-reading surface needs zero
// changes to also show GitHub deployments once this is real.
'use strict';

function notImplemented(method) {
  return function () {
    throw new Error(
      `GithubExporter method "${method}" is not implemented. ` +
      `See lib/github-export.js for the exact contract a real implementation ` +
      `must satisfy, and the "What's genuinely missing" list at the top of that ` +
      `file for what configuration/infra a real implementation needs first.`
    );
  };
}

/**
 * @typedef {Object} GithubExportTarget
 * @property {string} repoFullName  e.g. "someaccount/their-site" -- an
 *   existing repo this account has already connected/authorized, never
 *   created implicitly by a push.
 * @property {string} [branch]      defaults to the repo's default branch.
 * @property {boolean} [createPagesDeploy]  for a 'static' runtimeType
 *   export only (see lib/hosting.js's recommend()) -- whether to also
 *   configure/trigger GitHub Pages for this branch. Ignored (and a real
 *   implementation should refuse it, not silently drop it) for a
 *   'server_required' export, which GitHub Pages cannot serve.
 */

/**
 * The contract a real GithubExporter must satisfy. Every method takes the
 * SAME ownership-scoped (db, ownerId, ...) shape every other domain module
 * in this repo already uses (lib/purchase.js, lib/deployment-store.js,
 * etc.) -- never a bare projectId/repo alone -- so an IDOR check is
 * structurally impossible to skip by accident, matching this codebase's
 * fail-closed ownership discipline everywhere else.
 */
function getGithubExporter() {
  return {
    // Whether this account has connected a GitHub identity/installation at
    // all (before offering repo selection in any UI). A real implementation
    // reads a per-account OAuth/App-installation record; there is no such
    // storage in this schema yet (see migrations/ -- a real pass would add
    // a github_installations table, scoped by owner_id like every other
    // per-account table here).
    isConnected: notImplemented('isConnected'),

    // Lists repos this account's GitHub connection can push to. Real
    // implementations paginate the GitHub API; never return a cached/stale
    // list as if live.
    listRepos: notImplemented('listRepos'),

    // Pushes an ALREADY-COMPILED export (the same `workDir` compileExport
    // produces -- see server.js's POST /api/projects/:id/export for the
    // exact call this would sit next to) to `target.repoFullName`. Must be
    // ownership-scoped (db, ownerId, projectId) exactly like every export/
    // deployment route in server.js, and must verify the snapshot/
    // deployment being pushed is one this owner actually owns before
    // touching any GitHub credential -- never trust a client-supplied repo
    // name alone as authorization to push.
    //
    // Returns a deployment-store-shaped record (state: 'ready'|'failed',
    // target: 'github', + whatever GitHub-specific fields a real
    // implementation adds, e.g. commitSha/pagesUrl) so
    // deployment-store.js's existing list/read routes and the My Websites
    // surface can show it without any schema migration beyond widening the
    // `target` column's accepted values.
    pushExport: notImplemented('pushExport'),

    // Best-effort status check for a previously pushed deployment (e.g. did
    // the Pages build succeed) -- mirrors lib/domain.js's verify() shape
    // (a real network check, honest about failure, never assumed success).
    checkDeployStatus: notImplemented('checkDeployStatus'),
  };
}

module.exports = { getGithubExporter };
