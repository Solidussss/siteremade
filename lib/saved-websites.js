// Every website saved to an account -- drafts AND purchased -- as the Client App lists it (GET
// /api/app-bridge/websites). Metadata only: never the saved state, never image bytes.
//
// The source is the owned-projects table (the same rows GET /api/projects and the builder's "Saved projects" list
// read), not purchase snapshots: before this, the app could only ever see purchased websites, so a project saved to
// the account as a draft never appeared there. Purchase facts are FOLDED IN from one batch read of the account's
// purchase snapshots, and publish facts from one batch read of published revisions -- never a query per project.
// Immutable purchase snapshots stay the only source of truth for ownership and the download handoff
// (server.js purchasedHandoffSource); this list only describes them.
'use strict';
const projectStore = require('./project-store');
const purchase = require('./purchase');
const publishedSnapshots = require('./published-snapshots');

// Which direction (of up to 3) the app shows and edits -- the purchased one when there is a purchase snapshot, else
// the draft's active one. Same rule as server.js canonicalDirectionIndex, from already-loaded data.
function directionIndexOf(directionsState, snapshot) {
  const count = Array.isArray(directionsState && directionsState.directions) ? directionsState.directions.length : 0;
  const idx = snapshot && Number.isInteger(snapshot.directionIndex) ? snapshot.directionIndex
    : (Number.isInteger(directionsState && directionsState.activeDirectionIndex) ? directionsState.activeDirectionIndex : 0);
  return Math.max(0, Math.min(Math.max(0, count - 1), idx));
}

// -> [{ projectId, name, businessName, mode, status, revision, createdAt, updatedAt, isPurchased, purchaseRef, purchasedAt,
//       purchasedRevision, hasPurchaseSnapshot, canEdit, canPublish, hasUnpublishedChanges }], most recently updated first
function listSavedWebsites(db, ownerId) {
  const snapshots = new Map(purchase.listOwnedPurchaseSnapshots(db, ownerId).map(s => [s.projectId, s]));
  const published = publishedSnapshots.listLatestOwnedPublishedRevisions(db, ownerId);
  return projectStore.listOwnedProjectsRaw(db, ownerId)
    .filter(p => p.status !== 'archived') // an archived draft is gone from the account's point of view
    .map(p => {
      const snapshot = snapshots.get(p.id) || null;
      const direction = ((p.directionsState && p.directionsState.directions) || [])[directionIndexOf(p.directionsState, snapshot)] || {};
      const isPurchased = p.status === 'purchased';
      const publishedRevision = published.has(p.id) ? published.get(p.id) : null;
      const deliveredRevision = publishedRevision != null ? publishedRevision : (snapshot ? snapshot.projectRevision : null);
      const businessName = direction.business && typeof direction.business.name === 'string' && direction.business.name.trim() ? direction.business.name.trim().slice(0, 200) : null;
      return {
        projectId: p.id, name: p.name, businessName,
        // the stored schema says what kind of website it is (lib/project-store.js validateDirection: mode 'creative')
        mode: direction.mode === 'creative' ? 'creative' : 'business',
        status: p.status, revision: p.revision, createdAt: p.createdAt, updatedAt: p.updatedAt,
        isPurchased, purchaseRef: p.purchaseRef || null,
        purchasedAt: snapshot ? snapshot.createdAt : null, purchasedRevision: snapshot ? snapshot.projectRevision : null,
        hasPurchaseSnapshot: !!snapshot,
        canEdit: true, canPublish: isPurchased,
        hasUnpublishedChanges: isPurchased && deliveredRevision !== null && p.revision > deliveredRevision,
      };
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

module.exports = { listSavedWebsites, directionIndexOf };
