import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Copy, Trash2, Upload } from 'lucide-react';
import { trpc } from '@/providers/trpc-client';
import { ConfirmButton } from './ConfirmButton';
import { useTransientFlag } from '@/hooks/useTransientFlag';
import { fallbackJpeg, type ImageRef, type ImageVariant } from '@/lib/imageUrl';

interface UploadedImageRow extends ImageRef {
  id: number;
  origName: string;
  origMime: string;
  origBytes: number;
}

// Strip the `data:<mime>;base64,` prefix that FileReader.readAsDataURL prepends.
function stripDataUrlPrefix(dataUrl: string): string {
  const i = dataUrl.indexOf(',');
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(stripDataUrlPrefix(String(reader.result)));
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function markdownRef(hash: string, alt = ''): string {
  return `![${alt}](hash:${hash})`;
}

// Preview thumb uses the smallest jpeg variant available (or any), composed at
// /uploads/img/<storageKey> by the public URL helper.
function thumbUrl(variants: ImageVariant[]): string | undefined {
  const jpegs = variants.filter((v) => v.format === 'jpeg');
  const pool = jpegs.length > 0 ? jpegs : variants;
  if (pool.length === 0) return undefined;
  const smallest = pool.reduce<ImageVariant>((a, b) => (b.width < a.width ? b : a), pool[0]!);
  return `/uploads/img/${smallest.storageKey}`;
}

export default function ImageUploadPanel() {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.upload.list.useQuery() as {
    data?: UploadedImageRow[];
    isLoading: boolean;
  };

  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copyActive, copy] = useTransientFlag(1500);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.upload.image.useMutation({
    onSuccess: () => {
      utils.upload.list.invalidate();
      setUploadError(null);
    },
    onError: (err) => setUploadError(err.message),
  });

  const deleteMutation = trpc.upload.delete.useMutation({
    onSuccess: () => {
      utils.upload.list.invalidate();
      setDeleteError(null);
    },
    onError: (err) => setDeleteError(err.message),
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    for (const file of Array.from(files)) {
      try {
        const dataBase64 = await readFileAsBase64(file);
        await uploadMutation.mutateAsync({
          dataBase64,
          origName: file.name,
        });
      } catch (err) {
        // mutation onError already records this; loop continues with next file
        setUploadError((err as Error).message);
      }
    }
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    e.target.value = ''; // allow re-selecting the same file
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const onCopyRef = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(markdownRef(hash));
      setCopiedHash(hash);
      copy();
    } catch {
      setUploadError('Clipboard write failed — copy manually.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-foreground bg-card/50'
            : 'border-border/30 hover:border-border/60'
        }`}
      >
        <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
        <p className="font-mono text-xs text-muted-foreground">
          Drop image or click to choose (jpeg / png / webp / avif, ≤10 MB)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          onChange={onPick}
          className="hidden"
        />
        {uploadMutation.isPending && (
          <p className="font-mono text-[10px] text-foreground mt-3">Uploading…</p>
        )}
        {uploadError && (
          <p className="font-mono text-[10px] text-red-400 mt-3">{uploadError}</p>
        )}
      </div>

      {/* List */}
      <div>
        <h2 className="font-mono text-xs tracking-wider uppercase text-foreground mb-3">
          Uploaded Images
        </h2>
        {deleteError && (
          <p className="font-mono text-[10px] text-red-400 mb-3">{deleteError}</p>
        )}
        {isLoading ? (
          <p className="font-mono text-xs text-muted-foreground">Loading…</p>
        ) : !rows || rows.length === 0 ? (
          <p className="font-mono text-xs text-muted-foreground">No images yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rows.map((img) => {
              const thumb = thumbUrl(img.variants) ?? fallbackJpeg(img);
              return (
                <div
                  key={img.id}
                  className="border border-border/30 rounded-sm p-3 flex gap-3"
                >
                  <div className="w-20 h-20 shrink-0 bg-muted overflow-hidden rounded-sm">
                    {thumb && (
                      <img
                        src={thumb}
                        alt={img.origName}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="font-display text-sm text-foreground truncate" title={img.origName}>
                      {img.origName}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {img.width}×{img.height} · {formatBytes(img.origBytes)} ·{' '}
                      {img.variants.length} variants
                    </p>
                    <code
                      className="block font-mono text-[10px] text-muted-foreground/80 truncate"
                      title={markdownRef(img.hash)}
                    >
                      {markdownRef(img.hash)}
                    </code>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onCopyRef(img.hash)}
                        className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        {copyActive && copiedHash === img.hash ? 'Copied' : 'Copy ref'}
                      </button>
                      <ConfirmButton
                        message={`Delete ${img.origName}? This will remove all variants from disk.`}
                        onConfirm={() => deleteMutation.mutate({ hash: img.hash })}
                        className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </ConfirmButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
