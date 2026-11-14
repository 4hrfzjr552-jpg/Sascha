/** Deterministic, bounded correction functions shared by browser and Node tests. */
export function neutralPhotoCorrection(meanLuma: number): { gain: number; contrast: number } {
  if (!Number.isFinite(meanLuma) || meanLuma < 0 || meanLuma > 255) {
    return { gain: 1, contrast: 1 };
  }
  // Gentle corrections only. Strong colour changes can misrepresent denim.
  const gain = meanLuma < 100 ? 1.035 : meanLuma < 145 ? 1.018 : meanLuma > 190 ? 0.985 : 1.008;
  return { gain, contrast: 1.018 };
}

export function adjustPhotoChannel(value: number, gain: number, contrast: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(gain) || !Number.isFinite(contrast)) return 0;
  return Math.max(0, Math.min(255, Math.round((value - 128) * contrast * gain + 128 * gain)));
}
