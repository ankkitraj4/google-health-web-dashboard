import { describe, it, expect } from 'vitest';
import { chunkRanges } from '../src/sync.js';

describe('chunkRanges', () => {
  it('splits 90 days into 7 chunks of 14 (the real limit found live for active-minutes in M8)', () => {
    const ranges = chunkRanges(90);
    expect(ranges).toHaveLength(7);
    // Chunks must be contiguous and non-overlapping: each chunk's endDaysBack
    // equals the previous chunk's startDaysBack.
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].endDaysBack).toBe(ranges[i - 1].startDaysBack);
    }
    expect(ranges[0].endDaysBack).toBe(0);
    expect(ranges[ranges.length - 1].startDaysBack).toBe(90);
  });

  it('handles a totalDays that is an exact multiple of the chunk size', () => {
    const ranges = chunkRanges(14);
    expect(ranges).toEqual([{ startDaysBack: 14, endDaysBack: 0 }]);
  });

  it('handles a totalDays smaller than one chunk', () => {
    const ranges = chunkRanges(5);
    expect(ranges).toEqual([{ startDaysBack: 5, endDaysBack: 0 }]);
  });

  it('handles 0 days as no chunks', () => {
    expect(chunkRanges(0)).toEqual([]);
  });
});
