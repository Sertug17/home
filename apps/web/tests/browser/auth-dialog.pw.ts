import { expect, test } from "@playwright/test";

const fixture = `<!doctype html>
<meta charset="utf-8">
<button id="open">Open sign in</button>
<dialog id="sheet">
  <button id="close" type="button">Close sign in</button>
  <form id="email-form">
    <label>Email <input id="email" type="email" required></label>
    <button type="submit">Continue with email</button>
  </form>
  <form id="otp-form" hidden>
    <label>Verification code <input id="otp" inputmode="numeric"></label>
  </form>
  <button id="base" type="button">Continue with Base Account</button>
</dialog>
<aside id="handoff" hidden>
  <span>Connecting to mocked Base provider…</span>
  <button id="provider-confirm" type="button">Mock provider confirmation</button>
  <button id="cancel" type="button">Cancel sign in</button>
</aside>
<script>
const sheet = document.querySelector('#sheet');
const emailForm = document.querySelector('#email-form');
const otpForm = document.querySelector('#otp-form');
const handoff = document.querySelector('#handoff');
document.querySelector('#open').onclick = () => sheet.showModal();
document.querySelector('#close').onclick = () => sheet.close();
sheet.addEventListener('click', (event) => {
  if (event.target === sheet) sheet.close();
});
emailForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await Promise.resolve({ flowId: 'mock-flow' });
  emailForm.hidden = true;
  otpForm.hidden = false;
  document.querySelector('#otp').focus();
});
document.querySelector('#base').onclick = () => {
  sheet.close();
  handoff.hidden = false;
};
document.querySelector('#cancel').onclick = () => {
  handoff.hidden = true;
};
</script>`;

test("keyboard Enter keeps the native sign-in dialog open and focuses OTP", async ({ page }) => {
  await page.setContent(fixture);
  await page.getByRole("button", { name: "Open sign in" }).click();
  await page.getByLabel("Email").fill("fixture@example.test");
  await page.getByLabel("Email").press("Enter");

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Verification code")).toBeFocused();
});

test("Base provider confirmation is interactive after native modal ownership handoff", async ({ page }) => {
  await page.setContent(fixture);
  await page.getByRole("button", { name: "Open sign in" }).click();
  await page.getByRole("button", { name: "Continue with Base Account" }).click();

  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Mock provider confirmation" }).click();
  await page.getByRole("button", { name: "Cancel sign in" }).click();
  await expect(page.getByText("Connecting to mocked Base provider…")).not.toBeVisible();
});
