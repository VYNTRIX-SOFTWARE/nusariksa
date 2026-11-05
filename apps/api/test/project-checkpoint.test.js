import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { summarizePadkDrafts } from '../src/padk-transcription-workbench.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('checkpoint proyek hadir dan sinkron dengan cakupan regulatory draft', async () => {
  const checkpoint = await readFile(join(root, 'docs', 'PROJECT-CHECKPOINT.md'), 'utf8');
  const drafts = await Promise.all([1, 2].map(async category => JSON.parse(
    await readFile(join(root, 'regulations', 'padk43', 'cyber', 'drafts',
      'kategori-' + category + '.json'), 'utf8'),
  )));
  const stats = summarizePadkDrafts(drafts);
  assert.match(checkpoint, /NusaRiksa — Project checkpoint/);
  assert.match(checkpoint, /development/);
  assert.match(checkpoint, /Draft PR/);
  assert.match(checkpoint, /23 November 2026/);
  assert.match(checkpoint, /regulatory:release-gate/);
  assert.match(checkpoint, /DRAFT_UNVERIFIED/);
  assert.match(checkpoint,
    new RegExp('\\*\\*' + stats.totalDraftedIndicators +
      ' dari ' + stats.totalExpectedIndicators + ' indikator'));
  assert.match(checkpoint,
    new RegExp('\\*\\*' + stats.totalDraftedRankCriteria +
      ' dari ' + stats.totalExpectedRankCriteria + ' kriteria'));
  assert.equal(stats.productionEligible, false);
  for (const category of stats.categories) {
    assert.equal(category.sourcePdfVerified, false);
    assert.equal(category.independentReviewCompleted, false);
  }
});
