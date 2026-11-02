import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { orgMemberStatusSync } from './orgMemberStatus.js';

describe('orgMemberStatusSync', () => {
  it('reactivating an organization restores pending and suspended members', () => {
    assert.deepEqual(orgMemberStatusSync(true), {
      from: ['pending', 'suspended'],
      to: 'active',
    });
  });

  it('suspending an organization suspends active and pending members', () => {
    assert.deepEqual(orgMemberStatusSync(false), {
      from: ['active', 'pending'],
      to: 'suspended',
    });
  });
});
