import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * What kind of organization it is. A fixed list so AI planning and defaults (e.g. a youth
 * movement's camp) can rely on it. Adding a value is a one-line migration; removing or renaming
 * one is not. Kept out of the generated auth.ts, which `pnpm auth:schema` overwrites.
 */
export const organizationCategoryEnum = pgEnum('organization_category', [
  'youth_movement',
  'sports_club',
  'culture',
  'school',
  'neighbourhood',
  'charity',
  'student_association',
  'religious',
  'other',
]);

/**
 * The organization's legal form under Belgian law. Many youth movements are a de facto
 * association (feitelijke vereniging): no legal personality and no enterprise number.
 * `npo` is a vzw, `international_npo` an ivzw.
 */
export const organizationLegalFormEnum = pgEnum('organization_legal_form', [
  'de_facto_association',
  'npo',
  'international_npo',
  'foundation',
  'company',
  'other',
]);

export type OrganizationCategory = (typeof organizationCategoryEnum.enumValues)[number];
export type OrganizationLegalForm = (typeof organizationLegalFormEnum.enumValues)[number];
