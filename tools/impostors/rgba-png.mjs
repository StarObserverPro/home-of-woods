import assert from 'node:assert/strict';
import {crc32, deflateSync, inflateSync} from 'node:zlib';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, data) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0); result.write(type, 4, 4, 'ascii'); data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}

/** Data PNG: RGBA8, straight alpha, no canvas premultiplication or colour conversion. */
export function encodeRgbaPng(bytes, width, height) {
  assert.ok(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0);
  assert.equal(bytes.length, width * height * 4);
  const rgba = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), stride = width * 4;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(rows, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}

/** Verify this encoder's deliberately fixed RGBA8 / unfiltered PNG format. */
export function decodeRgbaPng(png) {
  assert.deepEqual(png.subarray(0, 8), signature, 'PNG signature');
  let width = 0, height = 0, ended = false;
  const compressed = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset), end = offset + 12 + length;
    assert.ok(end <= png.length, 'Complete PNG chunk');
    const type = png.toString('ascii', offset + 4, offset + 8), data = png.subarray(offset + 8, end - 4);
    assert.equal(png.readUInt32BE(end - 4), crc32(png.subarray(offset + 4, end - 4)), `${type} CRC`);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.deepEqual([...data.subarray(8)], [8, 6, 0, 0, 0], 'RGBA8 without interlace');
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') {ended = true; assert.equal(end, png.length); break;}
    offset = end;
  }
  assert.ok(width > 0 && height > 0 && ended && compressed.length > 0);
  const stride = width * 4, expected = (stride + 1) * height;
  const rows = inflateSync(Buffer.concat(compressed), {maxOutputLength: expected});
  assert.equal(rows.length, expected);
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    assert.equal(rows[y * (stride + 1)], 0, 'Unfiltered PNG row');
    rows.copy(rgba, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
  }
  return {width, height, rgba};
}
