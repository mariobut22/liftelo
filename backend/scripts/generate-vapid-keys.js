#!/usr/bin/env node
/*
 * Prints a fresh VAPID key pair for Web Push. NOTHING is written to a file and nothing is committed: copy the three values
 * into the server environment yourself (staging: GitHub secrets + the `staging-env` workflow; see docs/infrastructure.md §22).
 *
 *   node backend/scripts/generate-vapid-keys.js
 *
 * Keep the PRIVATE key secret. Changing the pair later invalidates every existing push subscription (users must re-enable).
 */
'use strict';

const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('VAPID_SUBJECT=mailto:admin@example.com   # replace with a real contact: mailto:you@domain or https://your-site');
