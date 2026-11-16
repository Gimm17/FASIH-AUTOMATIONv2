import { describe, expect, it } from 'vitest';
import { detectFacilityType, isHardFacilityMismatch, facilitiesCompatible } from './facility-type';

describe('detectFacilityType', () => {
  it('classifies the plan\'s example facilities', () => {
    expect(detectFacilityType('Puskesmas Lolantang')).toBe('HEALTH_PUSKESMAS');
    expect(detectFacilityType('Polindes Labangun')).toBe('HEALTH_POLINDES');
    expect(detectFacilityType('Poskesdes Bulagi II')).toBe('HEALTH_POSKESDES');
    expect(detectFacilityType('Posyandu Melati')).toBe('HEALTH_POSYANDU');
    expect(detectFacilityType('TK NEGERI BONEPUSO')).toBe('EDU_TK');
    expect(detectFacilityType('SMAN 1 TINANGKUNG')).toBe('EDU_SMA');
    expect(detectFacilityType('SDN Ponding')).toBe('EDU_SD');
  });

  it('treats SMK as its own level (SMA ≠ SMK)', () => {
    expect(detectFacilityType('SMKN 1 Bonepuso')).toBe('EDU_SMK');
    expect(detectFacilityType('SMK Budi Bakti')).toBe('EDU_SMK');
  });

  it('short keywords match as whole words only (TK ≠ TOKO)', () => {
    expect(detectFacilityType('TOKO BAGUS')).toBe('UNKNOWN');
    expect(detectFacilityType('KB Ceria')).toBe('EDU_KB');
  });

  it('UNKNOWN when nothing matches', () => {
    expect(detectFacilityType('Warung Kopi Jaya')).toBe('UNKNOWN');
    expect(detectFacilityType('')).toBe('UNKNOWN');
  });
});

describe('isHardFacilityMismatch', () => {
  it('hard reject between two different known types', () => {
    expect(isHardFacilityMismatch('HEALTH_POLINDES', 'HEALTH_POSKESDES')).toBe(true);
    expect(isHardFacilityMismatch('EDU_SMA', 'EDU_SMK')).toBe(true);
    expect(isHardFacilityMismatch('HEALTH_PUSKESMAS', 'HEALTH_PUSTU')).toBe(true);
  });

  it('never rejects when either side is UNKNOWN', () => {
    expect(isHardFacilityMismatch('UNKNOWN', 'HEALTH_PUSKESMAS')).toBe(false);
    expect(isHardFacilityMismatch('HEALTH_PUSKESMAS', 'UNKNOWN')).toBe(false);
  });

  it('same type is compatible', () => {
    expect(isHardFacilityMismatch('HEALTH_POLINDES', 'HEALTH_POLINDES')).toBe(false);
    expect(facilitiesCompatible('EDU_SD', 'EDU_SD')).toBe(true);
  });
});
