#!/usr/bin/env node
/* Unit test of backend/utils/uploadValidation.js (magic bytes, header dimensions, safe names). No database needed.
 *   node backend/scripts/upload-validation-test.js
 */
'use strict';
const assert = require('assert');
const path = require('path');
const {
  sniffFileType, imageDimensions, safeUploadName, PHOTO_MIMES, TYPES
} = require(path.join(__dirname, '..', 'utils', 'uploadValidation'));

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`  ok    ${name}`); };

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
// minimal JPEG: SOI, APP0 (JFIF, 16 bytes), SOF0 (height 300, width 400), padding
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0'),
  Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0x2c, 0x01, 0x90, 0x01, 0x01, 0x11, 0x00]),
  Buffer.alloc(20)
]);
const webpVp8x = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x30, 0, 0, 0]), Buffer.from('WEBPVP8X'), Buffer.from([10, 0, 0, 0, 0, 0, 0, 0]),
  Buffer.from([0x1f, 0x03, 0x00]), Buffer.from([0xef, 0x01, 0x00]), Buffer.alloc(8)]);

t('sniffs PNG, JPEG, WebP, GIF, PDF by content', () => {
  assert.strictEqual(sniffFileType(png), TYPES.png);
  assert.strictEqual(sniffFileType(jpeg), TYPES.jpeg);
  assert.strictEqual(sniffFileType(webpVp8x), TYPES.webp);
  assert.strictEqual(sniffFileType(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(10)])), TYPES.gif);
  assert.strictEqual(sniffFileType(Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(10)])), TYPES.pdf);
});
t('rejects HTML, SVG, scripts, empty and tiny buffers', () => {
  assert.strictEqual(sniffFileType(Buffer.from('<html><script>alert(1)</script></html>')), null);
  assert.strictEqual(sniffFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="x"></svg>')), null);
  assert.strictEqual(sniffFileType(Buffer.alloc(0)), null);
  assert.strictEqual(sniffFileType(Buffer.from([0xff, 0xd8])), null);
  assert.strictEqual(sniffFileType('not a buffer'), null);
});
t('only JPEG/PNG/WebP count as photos', () => {
  assert.ok(PHOTO_MIMES.has('image/jpeg') && PHOTO_MIMES.has('image/png') && PHOTO_MIMES.has('image/webp'));
  assert.ok(!PHOTO_MIMES.has('image/gif') && !PHOTO_MIMES.has('application/pdf') && !PHOTO_MIMES.has('image/svg+xml'));
});
t('reads dimensions from PNG, JPEG (SOF) and WebP (VP8X) headers', () => {
  assert.deepStrictEqual(imageDimensions(png, TYPES.png), { width: 1, height: 1 });
  assert.deepStrictEqual(imageDimensions(jpeg, TYPES.jpeg), { width: 400, height: 300 });
  assert.deepStrictEqual(imageDimensions(webpVp8x, TYPES.webp), { width: 800, height: 496 });
});
t('dimension parsing never throws on truncated data', () => {
  assert.strictEqual(imageDimensions(jpeg.subarray(0, 14), TYPES.jpeg), null);
  assert.strictEqual(imageDimensions(png.subarray(0, 20), TYPES.png), null);
  assert.strictEqual(imageDimensions(Buffer.from('RIFF....WEBPVP8X'), TYPES.webp), null);
});
t('safe names: <companyId>- prefix, extension from the detected type, never from the client', () => {
  const name = safeUploadName(7, TYPES.jpeg, 'i42');
  assert.match(name, /^7-i42-\d+-[0-9a-f]{12}\.jpg$/);
  assert.notStrictEqual(name, safeUploadName(7, TYPES.jpeg, 'i42'));
  assert.match(safeUploadName(7, TYPES.png, '../../etc'), /^7-etc-/);
  assert.throws(() => safeUploadName(0, TYPES.png));
  assert.throws(() => safeUploadName('x', TYPES.png));
});

console.log(`\n${passed} passed, 0 failed`);
