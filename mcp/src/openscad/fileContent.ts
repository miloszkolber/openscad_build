import type { FileInputContent } from './OpenScadRunner.js';

export function decodeFileContent(input: FileInputContent): Buffer {
  if (typeof input === 'string') {
    return Buffer.from(input, 'utf8');
  }
  if ('base64' in input) {
    return Buffer.from(input.base64, 'base64');
  }
  return Buffer.from(input.contentBase64, 'base64');
}
