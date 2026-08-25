# Chief Kivv DJ Card - Hardened Release

Mobile-first DJ digital business card with Instagram/contact actions, booking requests, Firebase-hosted MP3 mixes, and an authenticated admin dashboard.

## Security built into this release

- Firestore booking creates use an explicit required/allowed field schema.
- Public bookings must start with `status: NEW`.
- Field types and practical length limits are enforced server-side by Firestore Rules.
- Public users cannot read, update, or delete booking records.
- Mix writes require the exact authenticated admin email.
- Mix updates are limited to the `isLatest` field after creation.
- Storage uploads require the admin and MP3 content no larger than 250 MB.
- App Check with reCAPTCHA v3 is supported in both public and admin pages.
- A hidden honeypot reduces basic automated booking spam.
- Common private credential filenames are excluded by `.gitignore`.
- No password, service-account JSON, or server secret belongs in browser code or GitHub.

## Required setup order

Follow `Chief_Kivv_DJ_Card_FINAL_Setup_Manual.pdf` included with this project. The release sequence is:

1. Security Hardening
2. Firebase Setup
3. GitHub Deployment
4. Functional Test
5. Security Test
6. Launch

Do not enable Firebase App Check enforcement until the site key is installed in `firebase-config.js`, the deployed site is sending valid App Check requests, and the manual's App Check verification steps pass.

## Admin identity

The project is intentionally locked to:

`doublecupbookings@gmail.com`

Create that exact Email/Password user in Firebase Authentication. Choose your own strong password and keep it private.

## Public configuration

Edit `firebase-config.js` with only:

- Firebase Web App config values
- public reCAPTCHA v3 App Check site key

These are client-side identifiers. Never add a Firebase Admin SDK service-account file, private key, Gmail password, Stripe secret, or other server credential.

## Important

Firebase Cloud Storage requirements and pricing can change. Review the current Firebase console prompts and billing information before enabling Storage. This project intentionally does not contain automatic email/SMS notifications because those require a trusted server-side service; do not place private mail or messaging credentials in browser JavaScript.
