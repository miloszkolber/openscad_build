export function join(a: string, b: string): string {
  return `${a.replace(/\/$/, '')}/${b.replace(/^\//, '')}`;
}

export async function createEditorFS(): Promise<FS> {
  BrowserFS.install(typeof window === 'object' ? window : self);
  const response = await fetch('./api/files', {cache: 'no-store'});
  if (!response.ok) throw new Error('Cannot load the mounted model directory');
  const fonts = await fetch('./fonts.zip');
  if (!fonts.ok) throw new Error('Cannot load fonts');
  const fontData = BrowserFS.BFSRequire('buffer').Buffer.from(await fonts.arrayBuffer());
  const options = {
    fs: 'OverlayFS',
    options: {
      readable: {fs: 'MountableFileSystem', options: {
        '/models': {fs: 'XmlHttpRequest', options: {index: await response.json(), baseUrl: './models/'}},
        '/fonts': {fs: 'ZipFS', options: {zipData: fontData}},
      }},
      writable: {fs: 'InMemory'},
    },
  };
  await new Promise<void>((resolve, reject) => BrowserFS.configure(options, error => error ? reject(error) : resolve()));
  return BrowserFS.BFSRequire('fs');
}
