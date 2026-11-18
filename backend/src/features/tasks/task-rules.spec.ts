import { describe, expect, it } from 'vitest';
import { canSeeTask, isOpen, isUnassigned, memberUpdateError } from './task-rules.js';

const unassigned = { assigneeUserId: null, assigneeName: null };
const mine = { assigneeUserId: 'me', assigneeName: null };
const someoneElses = { assigneeUserId: 'other', assigneeName: null };
const external = { assigneeUserId: null, assigneeName: 'Bakker Jan' };

describe('isUnassigned', () => {
  it('is true only without a member and without a typed-in name', () => {
    expect(isUnassigned(unassigned)).toBe(true);
    expect(isUnassigned(mine)).toBe(false);
    expect(isUnassigned(external)).toBe(false);
  });
});

describe('isOpen', () => {
  it('treats everything but done as open', () => {
    expect(isOpen('todo')).toBe(true);
    expect(isOpen('in_progress')).toBe(true);
    expect(isOpen('done')).toBe(false);
  });
});

describe('canSeeTask', () => {
  it('lets managers see every task', () => {
    const manager = { userId: 'me', canManage: true };
    for (const task of [unassigned, mine, someoneElses, external]) {
      expect(canSeeTask(manager, task)).toBe(true);
    }
  });

  it('lets members see their own and unassigned tasks only', () => {
    const viewer = { userId: 'me', canManage: false };
    expect(canSeeTask(viewer, mine)).toBe(true);
    expect(canSeeTask(viewer, unassigned)).toBe(true);
    expect(canSeeTask(viewer, someoneElses)).toBe(false);
    expect(canSeeTask(viewer, external)).toBe(false);
  });
});

describe('memberUpdateError', () => {
  it('lets the assignee change the status', () => {
    expect(memberUpdateError('me', mine, { status: 'done' })).toBeNull();
  });

  it('lets the assignee give the task back', () => {
    expect(memberUpdateError('me', mine, { assigneeUserId: null })).toBeNull();
    expect(memberUpdateError('me', mine, { status: 'todo', assigneeUserId: null })).toBeNull();
    expect(memberUpdateError('me', mine, { assigneeUserId: null, assigneeName: null })).toBeNull();
  });

  it('rejects any other field, or assigning someone else', () => {
    expect(memberUpdateError('me', mine, { title: 'x' })).not.toBeNull();
    expect(memberUpdateError('me', mine, { priority: 'high' })).not.toBeNull();
    expect(memberUpdateError('me', mine, { labelIds: [] })).not.toBeNull();
    expect(memberUpdateError('me', mine, { assigneeUserId: 'other' })).not.toBeNull();
    expect(memberUpdateError('me', mine, { assigneeName: 'Jan' })).not.toBeNull();
  });

  it('rejects changes to tasks that are not assigned to them', () => {
    expect(memberUpdateError('me', unassigned, { status: 'done' })).not.toBeNull();
    expect(memberUpdateError('me', someoneElses, { status: 'done' })).not.toBeNull();
  });
});
