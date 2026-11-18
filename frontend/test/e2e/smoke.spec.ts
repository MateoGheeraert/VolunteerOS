import { expect, test } from '@playwright/test';

// Journey A in its smallest form: sign up → create an organization → create an event.
// Uses a fresh address per run; the accounts it creates stay in the dev database.
test('an organizer signs up, creates an organization and an event', async ({ page }, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@volunteeros.test`;

  await page.goto('/events');
  await expect(page).toHaveURL(/\/login/);

  await page.getByRole('link', { name: 'Maak er een aan' }).click();
  await page.getByLabel('Naam', { exact: true }).fill('Smoke Test');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Wachtwoord').fill('smoke-test-password');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Naam van je organisatie').fill('Smoke Test Chiro');
  await page.getByLabel('Soort organisatie').selectOption('youth_movement');
  await page.getByRole('button', { name: 'Verder' }).click();

  await expect(page.getByRole('heading', { name: 'Nog geen evenementen' })).toBeVisible();
  await page.getByRole('link', { name: 'Maak je eerste evenement' }).click();

  await page.getByLabel('Naam', { exact: true }).fill('Spaghettiavond');
  await page.getByRole('button', { name: 'Datum' }).click();
  await page.getByRole('button', { name: 'Ga naar volgende maand' }).click();
  await page.getByRole('gridcell', { name: '15' }).getByRole('button').click();
  await page.getByLabel('Begint om').fill('18:00');
  await page.getByLabel('Eindigt om').fill('01:00');
  await page.getByRole('button', { name: 'Evenement aanmaken' }).click();

  await expect(page.getByRole('heading', { name: 'Spaghettiavond' })).toBeVisible();
  await expect(page.getByText('Concept')).toBeVisible();
  await page.getByRole('button', { name: 'Publiceren' }).click();
  await expect(page.getByText('Gepubliceerd').first()).toBeVisible();
});
