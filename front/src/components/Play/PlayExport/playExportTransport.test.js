import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSharePayload,
  canvasToBlob,
  createPngFile,
  dataUrlToBlob,
  detectShareSupport,
  downloadBlob,
  shareFile,
} from './playExportTransport';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('playExportTransport', () => {
  it('builds a blob from data URLs', () => {
    const blob = dataUrlToBlob('data:image/png;base64,SGVsbG8=');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('falls back to toDataURL when canvas.toBlob is unavailable', async () => {
    const blob = await canvasToBlob({
      toBlob: null,
      toDataURL: () => 'data:image/png;base64,SGVsbG8=',
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });

  it('detects share support and builds share payload', () => {
    const file = new File([new Blob(['x'])], 'chart.png', { type: 'image/png' });
    const payload = buildSharePayload({
      file,
      title: 'Title',
      text: 'Text',
      url: 'https://minutesmap.com/game',
    });
    expect(payload).toEqual({
      files: [file],
      title: 'Title',
      text: 'Text',
      url: 'https://minutesmap.com/game',
    });
    expect(
      detectShareSupport({
        file,
        navigatorRef: {
          share: vi.fn(),
          canShare: vi.fn(() => true),
        },
      }),
    ).toEqual({ canShareFiles: true, errorMessage: null });
  });

  it('shares files when navigator.share succeeds', async () => {
    const file = new File([new Blob(['x'])], 'chart.png', { type: 'image/png' });
    const share = vi.fn().mockResolvedValue(undefined);
    const result = await shareFile({
      file,
      title: 'Title',
      text: 'Text',
      url: 'https://minutesmap.com/game',
      navigatorRef: { share },
    });
    expect(share).toHaveBeenCalledWith({
      files: [file],
      title: 'Title',
      text: 'Text',
      url: 'https://minutesmap.com/game',
    });
    expect(result).toEqual({ shared: true, aborted: false, error: null });
  });

  it('downloads and schedules object URL cleanup', () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const documentRef = {
      createElement: vi.fn(() => ({ click, remove, href: '', download: '' })),
      body: { appendChild },
    };
    const urlApi = {
      createObjectURL: vi.fn(() => 'blob:test-url'),
      revokeObjectURL: vi.fn(),
    };

    const file = createPngFile({
      blob: new Blob(['x'], { type: 'image/png' }),
      fileName: 'chart.png',
    }).file;

    downloadBlob({
      blob: file,
      fileName: 'chart.png',
      documentRef,
      urlApi,
      revokeDelayMs: 10,
    });

    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10);
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });
});
