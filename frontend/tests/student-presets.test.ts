import { describe, expect, it } from 'vitest';
import { resolveStudentPreset } from '@/lib/presets/student-presets';

describe('student presets', () => {
  it.each(['myth', 'rocket', 'sun', 'moon', 'mars', 'stars', 'chanye'])('resolves the %s preset to a Chinese prompt', (key) => {
    const preset = resolveStudentPreset(key);
    expect(preset?.key).toBe(key);
    expect(preset?.prompt.length).toBeGreaterThan(40);
    expect(preset?.prompt).toMatch(/[\u4e00-\u9fff]/);
  });

  it('ignores unknown or absent presets', () => {
    expect(resolveStudentPreset('unknown')).toBeNull();
    expect(resolveStudentPreset(null)).toBeNull();
  });
});
