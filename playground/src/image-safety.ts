function concat(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.byteLength }
  return output
}

function sanitizeJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes
  const parts: Uint8Array[] = [bytes.slice(0, 2)]
  let offset = 2
  while (offset + 1 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]
    if (marker === 0xda || marker === 0xd9) { parts.push(bytes.slice(offset)); return concat(parts) }
    if (offset + 3 >= bytes.length) return bytes
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (length < 2 || offset + 2 + length > bytes.length) return bytes
    const metadata = marker === 0xe1 || marker === 0xe2 || marker === 0xed || marker === 0xfe
    if (!metadata) parts.push(bytes.slice(offset, offset + 2 + length))
    offset += 2 + length
  }
  parts.push(bytes.slice(offset))
  return concat(parts)
}

const pngMetadataChunks = new Set(['eXIf', 'iTXt', 'tEXt', 'zTXt', 'tIME', 'iCCP'])
function sanitizePng(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 33) return bytes
  const parts: Uint8Array[] = [bytes.slice(0, 8)]
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset)
    const length = view.getUint32(0)
    const end = offset + 12 + length
    if (end > bytes.length) return bytes
    const type = Buffer.from(bytes.slice(offset + 4, offset + 8)).toString('ascii')
    if (!pngMetadataChunks.has(type)) parts.push(bytes.slice(offset, end))
    offset = end
    if (type === 'IEND') break
  }
  return offset === bytes.length ? concat(parts) : bytes
}

const webpMetadataChunks = new Set(['EXIF', 'XMP ', 'ICCP'])
function sanitizeWebp(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 20) return bytes
  const chunks: Uint8Array[] = []
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const type = Buffer.from(bytes.slice(offset, offset + 4)).toString('ascii')
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true)
    const end = offset + 8 + size + (size % 2)
    if (end > bytes.length) return bytes
    if (!webpMetadataChunks.has(type)) {
      const chunk = bytes.slice(offset, end)
      if (type === 'VP8X' && chunk.length >= 9) {
        const copy = chunk.slice()
        copy[8] &= ~(0x20 | 0x08 | 0x04)
        chunks.push(copy)
      } else chunks.push(chunk)
    }
    offset = end
  }
  if (offset !== bytes.length) return bytes
  const body = concat(chunks)
  const header = bytes.slice(0, 12)
  new DataView(header.buffer, header.byteOffset, header.byteLength).setUint32(4, body.byteLength + 4, true)
  return concat([header, body])
}

/** Removes privacy-bearing metadata without decoding or re-encoding image pixels. */
export function sanitizeImageMetadata(bytes: Uint8Array, mediaType: string): Uint8Array {
  if (mediaType === 'image/jpeg') return sanitizeJpeg(bytes)
  if (mediaType === 'image/png') return sanitizePng(bytes)
  if (mediaType === 'image/webp') return sanitizeWebp(bytes)
  throw new Error('PLAYGROUND_IMAGE_MEDIA_TYPE_UNSUPPORTED')
}
